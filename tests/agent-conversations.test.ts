import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { agentDraftsKey, clearLegacyAgentDrafts, LEGACY_AGENT_DRAFTS_KEY, readUserDrafts } from "../src/lib/agent/client-drafts";

const dataDir = mkdtempSync(join(tmpdir(), "signal-agent-conversations-test-"));
process.env.SIGNAL_DATA_DIR = dataDir;

let database: typeof import("../src/lib/marketplace/db");
let conversations: typeof import("../src/lib/agent/conversations");
let quota: typeof import("../src/lib/agent/quota");

test.before(async () => {
  database = await import("../src/lib/marketplace/db");
  conversations = await import("../src/lib/agent/conversations");
  quota = await import("../src/lib/agent/quota");
  const db = database.getMarketplaceDb();
  const now = new Date().toISOString();
  const insert = db.prepare("INSERT INTO developers (id, email, password_hash, name, role, status, created_at, updated_at) VALUES (?, ?, 'x:y', ?, 'user', 'active', ?, ?)");
  insert.run("agent-user-a", "agent-a@test.local", "Agent A", now, now);
  insert.run("agent-user-b", "agent-b@test.local", "Agent B", now, now);
});

test.after(() => {
  database.getMarketplaceDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("本地草稿键按用户分桶且清理旧全局键", () => {
  const values = new Map<string, string>([
    [agentDraftsKey("agent-user-a"), JSON.stringify([{ id: "a" }])],
    [agentDraftsKey("agent-user-b"), JSON.stringify([{ id: "b" }])],
    [LEGACY_AGENT_DRAFTS_KEY, JSON.stringify([{ id: "legacy-secret" }])],
  ]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => { values.delete(key); } };
  assert.deepEqual(readUserDrafts<{ id: string }>(storage, "agent-user-a"), [{ id: "a" }]);
  assert.deepEqual(readUserDrafts<{ id: string }>(storage, "agent-user-b"), [{ id: "b" }]);
  clearLegacyAgentDrafts(storage);
  assert.equal(values.has(LEGACY_AGENT_DRAFTS_KEY), false);
});

test("服务端会话和消息严格按 user_id 隔离", () => {
  const a = conversations.createAgentConversation("agent-user-a", "A 的私有策略");
  const b = conversations.createAgentConversation("agent-user-b", "B 的私有策略");
  conversations.appendAgentMessage({ userId: "agent-user-a", conversationId: a.id, role: "user", content: "只属于 A" });
  conversations.appendAgentMessage({ userId: "agent-user-b", conversationId: b.id, role: "user", content: "只属于 B" });
  assert.equal(conversations.getAgentConversation("agent-user-b", a.id), null);
  assert.equal(conversations.listAgentMessages("agent-user-b", a.id), null);
  assert.deepEqual(conversations.listAgentConversations("agent-user-a").conversations.map((item) => item.id), [a.id]);
  assert.deepEqual(conversations.listAgentMessages("agent-user-a", a.id)?.messages.map((item) => item.content), ["只属于 A"]);
});

test("同浏览器账号切换不会读取另一账号草稿", () => {
  const values = new Map<string, string>();
  values.set(agentDraftsKey("agent-user-a"), JSON.stringify([{ title: "A 策略" }]));
  const storage = { getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => { values.delete(key); } };
  assert.deepEqual(readUserDrafts(storage, "agent-user-b"), []);
});

test("每日额度使用条件更新原子阻止超额", () => {
  const date = "2099-12-31";
  assert.equal(quota.consumeAgentDailyQuota("agent-user-a", date, 2), true);
  assert.equal(quota.consumeAgentDailyQuota("agent-user-a", date, 2), true);
  assert.equal(quota.consumeAgentDailyQuota("agent-user-a", date, 2), false);
  assert.equal(quota.consumeAgentDailyQuota("agent-user-b", date, 2), true);
  const count = database.getMarketplaceDb().prepare("SELECT request_count FROM agent_usage WHERE user_id = ? AND usage_date = ?").get("agent-user-a", date) as { request_count: number };
  assert.equal(count.request_count, 2);
});

test("删除、导出和保留策略均校验所有者", () => {
  const item = conversations.createAgentConversation("agent-user-a", "用于导出的会话");
  conversations.appendAgentMessage({ userId: "agent-user-a", conversationId: item.id, role: "user", content: "导出内容" });
  assert.equal(conversations.exportAgentConversation("agent-user-b", item.id), null);
  assert.equal(conversations.updateConversationRetention("agent-user-b", item.id, 30), false);
  assert.equal(conversations.updateConversationRetention("agent-user-a", item.id, 30), true);
  assert.equal(conversations.exportAgentConversation("agent-user-a", item.id)?.messages.length, 1);
  assert.equal(conversations.deleteAgentConversation("agent-user-b", item.id), false);
  assert.equal(conversations.deleteAgentConversation("agent-user-a", item.id), true);
  assert.equal(conversations.getAgentConversation("agent-user-a", item.id), null);
});
