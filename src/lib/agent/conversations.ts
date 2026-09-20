import { randomUUID } from "node:crypto";
import { getMarketplaceDb } from "@/lib/marketplace/db";
import type { AgentArtifact, AgentMessage } from "./types";

export type AgentConversation = { id: string; title: string; summary: string; messageCount: number; lastMessagePreview: string; retentionDays: number; createdAt: string; updatedAt: string };
export type StoredAgentMessage = { id: string; seq: number; role: "user" | "assistant" | "system"; content: string; attachments: unknown[]; artifact: AgentArtifact | null; status: "pending" | "completed" | "failed" | "cancelled"; createdAt: string };

const preview = (value: string, length = 120) => value.replace(/\s+/g, " ").trim().slice(0, length);

function mapConversation(row: Record<string, unknown>): AgentConversation {
  return { id: String(row.id), title: String(row.title), summary: String(row.summary_text), messageCount: Number(row.message_count), lastMessagePreview: String(row.last_message_preview), retentionDays: Number(row.retention_days), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

export function createAgentConversation(userId: string, firstMessage: string, retentionDays = 365): AgentConversation {
  const db = getMarketplaceDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  const safeRetention = [30, 90, 365, 36500].includes(retentionDays) ? retentionDays : 365;
  const expiresAt = safeRetention === 36500 ? null : new Date(Date.now() + safeRetention * 86_400_000).toISOString();
  db.prepare(`INSERT INTO agent_conversations (id, user_id, title, retention_days, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, userId, preview(firstMessage, 60) || "新对话", safeRetention, expiresAt, now, now);
  return getAgentConversation(userId, id)!;
}

export function getAgentConversation(userId: string, conversationId: string): AgentConversation | null {
  const row = getMarketplaceDb().prepare("SELECT * FROM agent_conversations WHERE id = ? AND user_id = ? AND deleted_at IS NULL").get(conversationId, userId) as Record<string, unknown> | undefined;
  return row ? mapConversation(row) : null;
}

export function listAgentConversations(userId: string, limit = 20, cursor?: string | null): { conversations: AgentConversation[]; nextCursor: string | null } {
  const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
  const separator = cursor?.lastIndexOf("|") ?? -1;
  const cursorTime = separator > 0 ? cursor!.slice(0, separator) : cursor ?? null;
  const cursorId = separator > 0 ? cursor!.slice(separator + 1) : "~";
  const rows = getMarketplaceDb().prepare(`
    SELECT * FROM agent_conversations WHERE user_id = ? AND deleted_at IS NULL
      AND (? IS NULL OR updated_at < ? OR (updated_at = ? AND id < ?))
    ORDER BY updated_at DESC, id DESC LIMIT ?
  `).all(userId, cursorTime, cursorTime, cursorTime, cursorId, safeLimit + 1) as Array<Record<string, unknown>>;
  const hasMore = rows.length > safeLimit;
  const selected = rows.slice(0, safeLimit).map(mapConversation);
  return { conversations: selected, nextCursor: hasMore ? `${selected.at(-1)!.updatedAt}|${selected.at(-1)!.id}` : null };
}

export function appendAgentMessage(input: { userId: string; conversationId: string; role: "user" | "assistant" | "system"; content: string; requestId?: string; attachments?: unknown[]; artifact?: AgentArtifact | null; modelContent?: string | null; status?: StoredAgentMessage["status"]; providerLatencyMs?: number; compileLatencyMs?: number }): StoredAgentMessage {
  const db = getMarketplaceDb();
  return db.transaction(() => {
    const id = randomUUID();
    const now = new Date().toISOString();
    const sequence = db.prepare(`UPDATE agent_conversations SET message_count = message_count + 1, last_message_preview = ?, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL RETURNING message_count AS seq`)
      .get(preview(input.content), now, input.conversationId, input.userId) as { seq: number } | undefined;
    if (!sequence) throw new Error("会话不存在或无权访问");
    const seq = sequence.seq;
    db.prepare(`
      INSERT INTO agent_messages (id, conversation_id, user_id, seq, request_id, role, content, attachments_json, artifact_json, model_content, status, provider_latency_ms, compile_latency_ms, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.conversationId, input.userId, seq, input.requestId ?? null, input.role, input.content, JSON.stringify(input.attachments ?? []), input.artifact ? JSON.stringify(input.artifact) : null, input.modelContent ?? null, input.status ?? "completed", input.providerLatencyMs ?? null, input.compileLatencyMs ?? null, now, input.status === "pending" ? null : now);
    if (input.role === "assistant") {
      const older = db.prepare("SELECT role, content FROM agent_messages WHERE conversation_id = ? AND status = 'completed' ORDER BY seq DESC LIMIT 30 OFFSET 20").all(input.conversationId) as Array<{ role: string; content: string }>;
      const summary = preview(older.reverse().map((item) => `${item.role === "user" ? "用户" : "AI"}：${preview(item.content, 180)}`).join("；"), 1_000);
      db.prepare("UPDATE agent_conversations SET summary_text = ? WHERE id = ? AND user_id = ?").run(summary, input.conversationId, input.userId);
    }
    return { id, seq, role: input.role, content: input.content, attachments: input.attachments ?? [], artifact: input.artifact ?? null, status: input.status ?? "completed", createdAt: now };
  })();
}

export function listAgentMessages(userId: string, conversationId: string, limit = 50, beforeSeq?: number | null): { messages: StoredAgentMessage[]; nextBeforeSeq: number | null } | null {
  if (!getAgentConversation(userId, conversationId)) return null;
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const rows = getMarketplaceDb().prepare(`SELECT id, seq, role, content, attachments_json, artifact_json, status, created_at FROM agent_messages WHERE conversation_id = ? AND user_id = ? AND (? IS NULL OR seq < ?) ORDER BY seq DESC LIMIT ?`)
    .all(conversationId, userId, beforeSeq ?? null, beforeSeq ?? null, safeLimit + 1) as Array<Record<string, unknown>>;
  const hasMore = rows.length > safeLimit;
  const selected = rows.slice(0, safeLimit);
  const nextBeforeSeq = hasMore ? Number(selected.at(-1)!.seq) : null;
  const messages = selected.reverse().map((row) => ({ id: String(row.id), seq: Number(row.seq), role: row.role as StoredAgentMessage["role"], content: String(row.content), attachments: JSON.parse(String(row.attachments_json)), artifact: row.artifact_json ? JSON.parse(String(row.artifact_json)) as AgentArtifact : null, status: row.status as StoredAgentMessage["status"], createdAt: String(row.created_at) }));
  return { messages, nextBeforeSeq };
}

export function buildAgentContext(userId: string, conversationId: string, maxChars = 45_000): AgentMessage[] {
  const conversation = getAgentConversation(userId, conversationId);
  if (!conversation) throw new Error("会话不存在或无权访问");
  const rows = getMarketplaceDb().prepare("SELECT role, content FROM agent_messages WHERE conversation_id = ? AND user_id = ? AND role IN ('user', 'assistant') AND status = 'completed' ORDER BY seq DESC LIMIT 20").all(conversationId, userId) as Array<{ role: "user" | "assistant"; content: string }>;
  const result: AgentMessage[] = [];
  let used = conversation.summary.length;
  for (const row of rows) {
    if (used + row.content.length > maxChars) break;
    result.unshift(row); used += row.content.length;
  }
  if (conversation.summary) result.unshift({ role: "assistant", content: `较早会话摘要：${conversation.summary}` });
  return result;
}

export function latestAgentArtifact(userId: string, conversationId: string): AgentArtifact | null {
  const row = getMarketplaceDb().prepare("SELECT artifact_json FROM agent_messages WHERE conversation_id = ? AND user_id = ? AND artifact_json IS NOT NULL AND status = 'completed' ORDER BY seq DESC LIMIT 1").get(conversationId, userId) as { artifact_json: string } | undefined;
  return row ? JSON.parse(row.artifact_json) as AgentArtifact : null;
}

export function updateConversationRetention(userId: string, conversationId: string, retentionDays: number): boolean {
  if (![30, 90, 365, 36500].includes(retentionDays)) return false;
  const expiresAt = retentionDays === 36500 ? null : new Date(Date.now() + retentionDays * 86_400_000).toISOString();
  return getMarketplaceDb().prepare("UPDATE agent_conversations SET retention_days = ?, expires_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL").run(retentionDays, expiresAt, new Date().toISOString(), conversationId, userId).changes === 1;
}

export function deleteAgentConversation(userId: string, conversationId: string): boolean {
  const now = new Date().toISOString();
  return getMarketplaceDb().prepare("UPDATE agent_conversations SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL").run(now, now, conversationId, userId).changes === 1;
}

export function exportAgentConversation(userId: string, conversationId: string) {
  const conversation = getAgentConversation(userId, conversationId);
  if (!conversation) return null;
  const rows = getMarketplaceDb().prepare("SELECT id, seq, role, content, attachments_json, artifact_json, status, created_at FROM agent_messages WHERE conversation_id = ? AND user_id = ? ORDER BY seq ASC").all(conversationId, userId) as Array<Record<string, unknown>>;
  const messages = rows.map((row) => ({ id: String(row.id), seq: Number(row.seq), role: row.role as StoredAgentMessage["role"], content: String(row.content), attachments: JSON.parse(String(row.attachments_json)), artifact: row.artifact_json ? JSON.parse(String(row.artifact_json)) as AgentArtifact : null, status: row.status as StoredAgentMessage["status"], createdAt: String(row.created_at) }));
  return { exportedAt: new Date().toISOString(), conversation, messages };
}

export function cleanupAgentData(now = new Date()): { conversations: number; jobs: number; events: number } {
  const db = getMarketplaceDb();
  const hardDelete = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const jobCutoff = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const eventCutoff = new Date(now.getTime() - 400 * 86_400_000).toISOString();
  return db.transaction(() => {
    db.prepare("UPDATE agent_compile_jobs SET code_text = '' WHERE conversation_id IN (SELECT id FROM agent_conversations WHERE (deleted_at IS NOT NULL AND deleted_at < ?) OR (expires_at IS NOT NULL AND expires_at < ?))").run(hardDelete, now.toISOString());
    return {
      conversations: db.prepare("DELETE FROM agent_conversations WHERE (deleted_at IS NOT NULL AND deleted_at < ?) OR (expires_at IS NOT NULL AND expires_at < ?)").run(hardDelete, now.toISOString()).changes,
      jobs: db.prepare("DELETE FROM agent_compile_jobs WHERE finished_at IS NOT NULL AND finished_at < ?").run(jobCutoff).changes,
      events: db.prepare("DELETE FROM agent_request_events WHERE created_at < ?").run(eventCutoff).changes,
    };
  })();
}
