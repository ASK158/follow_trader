import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dataDir = mkdtempSync(join(tmpdir(), "signal-auth-test-"));
process.env.SIGNAL_DATA_DIR = dataDir;

let security: typeof import("../src/lib/auth/security");
let totp: typeof import("../src/lib/auth/totp");
let database: typeof import("../src/lib/marketplace/db");
let admin: typeof import("../src/lib/auth/admin");
let email: typeof import("../src/lib/auth/email");
let ga: typeof import("../src/lib/marketplace/ga");
let currency: typeof import("../src/lib/marketplace/currency");
let orders: typeof import("../src/lib/marketplace/orders");
let agentBilling: typeof import("../src/lib/agent/billing");
let platformSettings: typeof import("../src/lib/platform-settings");
let registrationRisk: typeof import("../src/lib/auth/registration-risk");
let tutorialStore: typeof import("../src/lib/tutorials");
let observationStore: typeof import("../src/lib/observation-accounts");
let observationComments: typeof import("../src/lib/observation-comments");

test.before(async () => {
  security = await import("../src/lib/auth/security");
  totp = await import("../src/lib/auth/totp");
  database = await import("../src/lib/marketplace/db");
  admin = await import("../src/lib/auth/admin");
  email = await import("../src/lib/auth/email");
  ga = await import("../src/lib/marketplace/ga");
  currency = await import("../src/lib/marketplace/currency");
  orders = await import("../src/lib/marketplace/orders");
  agentBilling = await import("../src/lib/agent/billing");
  platformSettings = await import("../src/lib/platform-settings");
  registrationRisk = await import("../src/lib/auth/registration-risk");
  tutorialStore = await import("../src/lib/tutorials");
  observationStore = await import("../src/lib/observation-accounts");
  observationComments = await import("../src/lib/observation-comments");
});

test.after(() => {
  database.getMarketplaceDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("same-origin 校验拒绝跨站和伪造 Origin", () => {
  const crossSite = new Request("https://signal.example.com/api/test", { method: "POST", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } });
  assert.equal(security.assertSameOrigin(crossSite)?.status, 403);
  const mismatched = new Request("https://signal.example.com/api/test", { method: "POST", headers: { origin: "https://evil.example", "sec-fetch-site": "same-origin" } });
  assert.equal(security.assertSameOrigin(mismatched)?.status, 403);
  const valid = new Request("https://signal.example.com/api/test", { method: "POST", headers: { origin: "https://signal.example.com", "sec-fetch-site": "same-origin" } });
  assert.equal(security.assertSameOrigin(valid), null);
});

test("持久化限流在窗口内阻止超额请求", () => {
  assert.equal(security.consumeRateLimit("test", "127.0.0.1", 2, 60_000).limited, false);
  assert.equal(security.consumeRateLimit("test", "127.0.0.1", 2, 60_000).limited, false);
  assert.equal(security.consumeRateLimit("test", "127.0.0.1", 2, 60_000).limited, true);
  security.clearRateLimit("test", "127.0.0.1");
  assert.equal(security.consumeRateLimit("test", "127.0.0.1", 2, 60_000).limited, false);
});

test("TOTP 符合 RFC 6238 测试向量并支持加密存储", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(totp.verifyTotp(secret, "287082", 59_000), true);
  assert.equal(totp.verifyTotp(secret, "000000", 59_000), false);
  const encrypted = totp.encryptSecret(secret);
  assert.notEqual(encrypted, secret);
  assert.equal(totp.decryptSecret(encrypted), secret);
});

test("Gas 格式化与无邮件网关时的验证邮件入队", async () => {
  assert.equal(currency.formatGa(1234), "1,234 Gas");
  await email.queueAccountEmail("new-user@test.local", "verify_email", "https://signal.example.com/account/verify-email?token=test");
  const queued = database.getMarketplaceDb().prepare("SELECT recipient, template, status FROM email_outbox WHERE recipient = ?").get("new-user@test.local");
  assert.deepEqual(queued, { recipient: "new-user@test.local", template: "verify_email", status: "pending" });
});

test("角色只能由管理员流程授予且不能移除最后一个管理员", () => {
  const db = database.getMarketplaceDb();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO developers (id, email, password_hash, name, role, status, email_verified_at, created_at, updated_at) VALUES (?, ?, 'x:y', ?, ?, 'active', ?, ?, ?)").run("admin-1", "admin@test.local", "Admin", "admin", now, now, now);
  db.prepare("INSERT INTO developers (id, email, password_hash, name, role, status, email_verified_at, created_at, updated_at) VALUES (?, ?, 'x:y', ?, 'user', 'active', ?, ?, ?)").run("user-1", "user@test.local", "User", now, now, now);
  assert.equal(admin.updateUserAccess("admin-1", "user-1", "admin", "active").ok, true);
  assert.equal(admin.updateUserAccess("admin-1", "admin-1", "user", "active").ok, false);
  assert.equal(admin.updateUserAccess("admin-1", "user-1", "user", "active").ok, true);
  assert.equal(admin.updateUserAccess("admin-1", "admin-1", "admin", "suspended").ok, false);
});

test("管理员 Gas 调整写入余额和不可变账本", () => {
  const granted = ga.adjustGaBalance("admin-1", "user-1", "grant", 1000, "测试初始积分");
  assert.equal(granted.ok, true);
  assert.equal(granted.ok && granted.balance, 1000);
  const deducted = ga.adjustGaBalance("admin-1", "user-1", "deduct", 100, "测试人工扣减");
  assert.equal(deducted.ok, true);
  assert.equal(deducted.ok && deducted.balance, 900);
  assert.equal(ga.adjustGaBalance("admin-1", "user-1", "deduct", 901, "余额不足").ok, false);
  assert.equal(ga.getGaBalance("user-1"), 900);
  const history = ga.listGaTransactions(10, "user-1");
  assert.deepEqual(history.map((item) => item.amount).sort((a, b) => a - b), [-100, 1000]);
});

test("Gas 购买原子扣款并在余额不足时完整回滚", () => {
  const purchased = orders.purchaseWithGa("official-test", "测试商品", "user@test.local", 250, "user-1");
  assert.equal(purchased.balance, 650);
  assert.equal(purchased.order.currency, "GA");
  assert.equal(ga.getGaBalance("user-1"), 650);
  const db = database.getMarketplaceDb();
  const purchaseLedger = db.prepare("SELECT amount, balance_after FROM ga_transactions WHERE order_id = ? AND type = 'purchase'").get(purchased.order.id) as { amount: number; balance_after: number };
  assert.deepEqual(purchaseLedger, { amount: -250, balance_after: 650 });
  const orderCount = (db.prepare("SELECT COUNT(*) AS count FROM orders WHERE buyer_user_id = ?").get("user-1") as { count: number }).count;
  assert.throws(() => orders.purchaseWithGa("too-expensive", "昂贵商品", "user@test.local", 651, "user-1"), orders.InsufficientGaBalanceError);
  assert.equal(ga.getGaBalance("user-1"), 650);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM orders WHERE buyer_user_id = ?").get("user-1") as { count: number }).count, orderCount);
});

test("Agent 先使用五次免费额度，之后原子扣费且失败原路退还", () => {
  const releasedFree = agentBilling.reserveAgentUsage("user-1", "agent-free-release");
  assert.equal(releasedFree.source, "free");
  assert.equal(releasedFree.freeRemaining, 4);
  assert.equal(agentBilling.releaseAgentUsage("user-1", "agent-free-release").freeRemaining, 5);

  for (let index = 1; index <= 5; index += 1) {
    const reservation = agentBilling.reserveAgentUsage("user-1", `agent-free-${index}`);
    assert.equal(reservation.source, "free");
    agentBilling.commitAgentUsage("user-1", reservation.requestId, "generate");
  }
  assert.equal(agentBilling.getAgentBillingStatus("user-1").freeRemaining, 0);

  const paid = agentBilling.reserveAgentUsage("user-1", "agent-paid-1");
  assert.equal(paid.source, "gas");
  assert.equal(paid.gasBalance, 649);
  agentBilling.commitAgentUsage("user-1", paid.requestId, "generate");

  const failed = agentBilling.reserveAgentUsage("user-1", "agent-paid-refund");
  assert.equal(failed.gasBalance, 648);
  assert.equal(agentBilling.releaseAgentUsage("user-1", failed.requestId).gasBalance, 649);
  assert.throws(() => agentBilling.reserveAgentUsage("user-1", "agent-paid-1"), agentBilling.DuplicateAgentRequestError);

  const adminUsage = agentBilling.reserveAgentUsage("admin-1", "agent-admin-1");
  assert.equal(adminUsage.source, "admin");
  assert.equal(adminUsage.gasBalance, 0);
  agentBilling.commitAgentUsage("admin-1", adminUsage.requestId, "generate");
  assert.equal(ga.getGaBalance("admin-1"), 0);

  const summary = ga.getFinanceSummary();
  assert.equal(summary.agentPaidRequestCount, 1);
  assert.equal(summary.agentFreeRequestCount, 5);
  assert.equal(summary.agentSpent, 1);

  const db = database.getMarketplaceDb();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO developers (id, email, password_hash, name, role, status, agent_free_uses, created_at, updated_at) VALUES ('user-no-gas', 'nogas@test.local', 'x:y', 'No Gas', 'user', 'active', 5, ?, ?)").run(now, now);
  assert.throws(() => agentBilling.reserveAgentUsage("user-no-gas", "agent-no-gas"), agentBilling.AgentInsufficientGasError);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM agent_billing_requests WHERE request_id = 'agent-no-gas'").get() as { count: number }).count, 0);
});

test("Agent 分级价格可由管理员配置并按预授权差额结算", () => {
  const configured = platformSettings.updatePlatformSettings({
    ...platformSettings.DEFAULT_PLATFORM_SETTINGS,
    agentFreeUsageLimit: 0,
    agentChatCost: 0.1,
    agentModifyCost: 0.5,
    agentGenerateCost: 1,
    agentMinimumGasToStart: 1,
  });
  assert.equal(configured.agentModifyCost, 0.5);
  const db = database.getMarketplaceDb();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO developers (id, email, password_hash, name, role, status, ga_balance, created_at, updated_at) VALUES ('user-tiered', 'tiered@test.local', 'x:y', 'Tiered', 'user', 'active', 3, ?, ?)").run(now, now);

  const chat = agentBilling.reserveAgentUsage("user-tiered", "tiered-chat");
  assert.equal(chat.reservedGasAmount, 1);
  platformSettings.updatePlatformSettings({ ...configured, agentChatCost: 0.2 });
  assert.equal(agentBilling.commitAgentUsage("user-tiered", chat.requestId, "chat").gasBalance, 2.9);
  platformSettings.updatePlatformSettings(configured);
  const modify = agentBilling.reserveAgentUsage("user-tiered", "tiered-modify");
  assert.equal(agentBilling.commitAgentUsage("user-tiered", modify.requestId, "modify").gasBalance, 2.4);
  const generate = agentBilling.reserveAgentUsage("user-tiered", "tiered-generate");
  assert.equal(agentBilling.commitAgentUsage("user-tiered", generate.requestId, "generate").gasBalance, 1.4);
  const rows = db.prepare("SELECT action, gas_amount FROM agent_billing_requests WHERE user_id = 'user-tiered' ORDER BY rowid").all();
  assert.deepEqual(rows, [{ action: "chat", gas_amount: 0.1 }, { action: "modify", gas_amount: 0.5 }, { action: "generate", gas_amount: 1 }]);
  platformSettings.updatePlatformSettings(platformSettings.DEFAULT_PLATFORM_SETTINGS);
});

test("注册风控按 IP 和设备限制批量账户并可取消高风险免费额度", () => {
  const request = new Request("https://signal.example.com/api/developer/register", { headers: { "x-forwarded-for": "203.0.113.8" } });
  const first = registrationRisk.assessRegistrationRisk(request, "first@example.com", "11111111-1111-4111-8111-111111111111");
  assert.equal(first.allowed, true);
  assert.equal(first.freeEligible, true);
  const db = database.getMarketplaceDb();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO developers (id, email, password_hash, name, role, status, created_at, updated_at) VALUES ('risk-user-1', 'risk1@test.local', 'x:y', 'Risk 1', 'user', 'active', ?, ?)").run(now, now);
  registrationRisk.recordRegistrationRisk("risk-user-1", first);
  const reused = registrationRisk.assessRegistrationRisk(request, "second@example.com", "11111111-1111-4111-8111-111111111111");
  assert.equal(reused.allowed, true);
  assert.equal(reused.freeEligible, false);
  db.prepare("INSERT INTO developers (id, email, password_hash, name, role, status, created_at, updated_at) VALUES ('risk-user-2', 'risk2@test.local', 'x:y', 'Risk 2', 'user', 'active', ?, ?)").run(now, now);
  assert.equal(registrationRisk.recordRegistrationRisk("risk-user-2", reused).recorded, true);
  const blocked = registrationRisk.assessRegistrationRisk(request, "third@example.com", "11111111-1111-4111-8111-111111111111");
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason ?? "", /设备/);
  const disposable = registrationRisk.assessRegistrationRisk(new Request("https://signal.example.com", { headers: { "x-forwarded-for": "203.0.113.9" } }), "test@mailinator.com", "22222222-2222-4222-8222-222222222222");
  assert.equal(disposable.freeEligible, false);
});

test("管理员教程支持图文发布并校验第三方视频平台链接", () => {
  const articleForm = new FormData();
  articleForm.set("kind", "article"); articleForm.set("title", "测试图文教程"); articleForm.set("summary", "用于验证教程管理流程的卡片简介");
  articleForm.set("category", "策略设计"); articleForm.set("level", "入门"); articleForm.set("duration", "10 分钟");
  articleForm.set("accent", "#b4162b"); articleForm.set("status", "published");
  articleForm.set("content", "<h2>教程正文</h2><p>这是一段超过二十个字符的完整测试教程正文，用于验证安全存储。</p><script>alert(1)</script>");
  const parsed = tutorialStore.validateTutorialForm(articleForm);
  assert.ok(parsed.input);
  const tutorial = tutorialStore.createTutorial("admin-1", parsed.input!);
  assert.equal(tutorialStore.getPublishedTutorial(tutorial.id)?.title, "测试图文教程");
  assert.equal(tutorial.content?.includes("script"), false);

  const videoForm = new FormData();
  videoForm.set("kind", "video"); videoForm.set("title", "测试视频教程"); videoForm.set("summary", "视频教程的基本内容介绍");
  videoForm.set("category", "视频课程"); videoForm.set("level", "进阶"); videoForm.set("duration", "12 分钟");
  videoForm.set("accent", "#285d52"); videoForm.set("status", "published"); videoForm.set("platform", "YouTube");
  videoForm.set("externalUrl", "https://www.bilibili.com/video/BV-test");
  assert.match(tutorialStore.validateTutorialForm(videoForm).error ?? "", /平台不匹配/);
  videoForm.set("externalUrl", "https://www.youtube.com/watch?v=test");
  assert.ok(tutorialStore.validateTutorialForm(videoForm).input);
});

test("观摩账号校验、加密保存并支持评论", () => {
  const form = new FormData();
  form.set("title", "欧美趋势实盘观摩"); form.set("platform", "MT5"); form.set("accountType", "真实账号");
  form.set("accountNumber", "12345678"); form.set("serverName", "Broker-Live01"); form.set("investorPassword", "readonly-pass");
  form.set("description", "<h2>账号介绍</h2><p>这是一个用于验证观摩空间功能的完整图文账号介绍内容。</p><script>alert(1)</script>");
  const parsed = observationStore.validateObservationForm(form);
  assert.ok(parsed.input);
  const account = observationStore.createObservationAccount("user-1", parsed.input!);
  assert.equal(account.platform, "MT5");
  assert.equal(account.investorPassword, "readonly-pass");
  assert.equal(account.description.includes("script"), false);
  const stored = database.getMarketplaceDb().prepare("SELECT investor_password FROM observation_accounts WHERE id = ?").get(account.id) as { investor_password: string };
  assert.notEqual(stored.investor_password, "readonly-pass");
  const comment = observationComments.createObservationComment(account.id, "admin-1", "账号运行情况看起来很稳定");
  assert.equal(comment.accountId, account.id);
  assert.equal(observationComments.listObservationComments(account.id)[0]?.content, "账号运行情况看起来很稳定");

  form.set("accountNumber", "invalid-account");
  assert.match(observationStore.validateObservationForm(form).error ?? "", /数字/);
});
