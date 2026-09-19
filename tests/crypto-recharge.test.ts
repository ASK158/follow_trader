import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dataDir = mkdtempSync(join(tmpdir(), "signal-recharge-test-"));
process.env.SIGNAL_DATA_DIR = dataDir;
process.env.NOWPAYMENTS_API_KEY = "test-api-key";
process.env.NOWPAYMENTS_IPN_SECRET = "test-ipn-secret";
process.env.NOWPAYMENTS_IPN_CALLBACK_URL = "https://signal.example.com/api/payments/nowpayments/ipn";

let database: typeof import("../src/lib/marketplace/db");
let nowPayments: typeof import("../src/lib/payments/nowpayments");
let recharges: typeof import("../src/lib/payments/recharges");
const originalFetch = globalThis.fetch;

test.before(async () => {
  database = await import("../src/lib/marketplace/db");
  nowPayments = await import("../src/lib/payments/nowpayments");
  recharges = await import("../src/lib/payments/recharges");
  const now = new Date().toISOString();
  database.getMarketplaceDb().prepare("INSERT INTO developers (id, email, password_hash, name, role, status, email_verified_at, created_at, updated_at) VALUES ('recharge-user', 'recharge@test.local', 'x:y', 'Recharge User', 'user', 'active', ?, ?, ?)").run(now, now, now);
});

test.after(() => {
  globalThis.fetch = originalFetch;
  database.getMarketplaceDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("充值金额严格限制为 2 至 500 USDT 且最多两位小数", () => {
  assert.equal(recharges.amountToCents(2), 200);
  assert.equal(recharges.amountToCents(500), 50_000);
  assert.throws(() => recharges.amountToCents(1.99));
  assert.throws(() => recharges.amountToCents(500.01));
  assert.throws(() => recharges.amountToCents(2.001));
});

test("NOWPayments IPN 使用递归键排序和 HMAC-SHA512 验签", () => {
  const payload = { payment_status: "finished", fee: { serviceFee: 1, currency: "usdt" }, payment_id: 123 };
  const signature = createHmac("sha512", "test-ipn-secret").update(nowPayments.canonicalizeNowPaymentsPayload(payload)).digest("hex");
  assert.equal(nowPayments.verifyNowPaymentsSignature(payload, signature), true);
  assert.equal(nowPayments.verifyNowPaymentsSignature(payload, `${signature.slice(0, -1)}0`), false);
  assert.equal(nowPayments.verifyNowPaymentsSignature(payload, null), false);
});

test("创建充值单并在 finished 后只入账一次", async () => {
  let requestCount = 0;
  globalThis.fetch = async (_input, init) => {
    requestCount += 1;
    if (init?.method === "POST") {
      const request = JSON.parse(String(init.body)) as { order_id: string };
      return Response.json({ payment_id: 987654, payment_status: "waiting", pay_address: "TTestAddress", price_amount: 25.25, price_currency: "usdttrc20", pay_amount: 25.25, pay_currency: "usdttrc20", order_id: request.order_id });
    }
    return Response.json({ min_amount: 2 });
  };
  const recharge = await recharges.createRecharge("recharge-user", 25.25);
  assert.equal(requestCount, 2);
  assert.equal(recharge.status, "waiting");
  assert.equal(recharge.payAddress, "TTestAddress");

  const payment = { payment_id: 987654, payment_status: "finished", pay_address: "TTestAddress", price_amount: 25.25, price_currency: "usdttrc20", pay_amount: 25.25, actually_paid: 25.25, pay_currency: "usdttrc20", order_id: recharge.id };
  const first = recharges.applyVerifiedPayment(payment);
  const second = recharges.applyVerifiedPayment(payment);
  assert.equal(first.credited, true);
  assert.equal(second.credited, false);
  assert.equal(recharges.getRecharge(recharge.id, "recharge-user")?.gasAmount, 25.25);
  assert.equal((database.getMarketplaceDb().prepare("SELECT ga_balance FROM developers WHERE id = 'recharge-user'").get() as { ga_balance: number }).ga_balance, 25.25);
  assert.equal((database.getMarketplaceDb().prepare("SELECT COUNT(*) AS count FROM ga_transactions WHERE type = 'crypto_recharge'").get() as { count: number }).count, 1);
});

test("少付、错币和重复入金不会自动增加 Gas", () => {
  const db = database.getMarketplaceDb();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO crypto_recharges (id, user_id, amount_cents, provider_payment_id, status, created_at, updated_at) VALUES ('rcg-review', 'recharge-user', 1000, 'review-payment', 'waiting', ?, ?)").run(now, now);
  const underpaid = recharges.applyVerifiedPayment({ payment_id: "review-payment", payment_status: "finished", pay_address: "T", price_amount: 10, price_currency: "usdttrc20", pay_amount: 10, actually_paid: 9, pay_currency: "usdttrc20", order_id: "rcg-review" });
  assert.equal(underpaid.status, "review_required");
  assert.equal(recharges.applyVerifiedPayment({ payment_id: "review-payment", payment_status: "wrong_asset_confirmed", pay_address: "T", price_amount: 10, price_currency: "usdttrc20", pay_amount: 10, actually_paid: 10, pay_currency: "usdtbsc", order_id: "rcg-review" }).status, "review_required");
});

test("处理失败的同一 Webhook 可以重试，处理成功后才去重", () => {
  const payload = { payment_id: "retry-payment", payment_status: "confirming" };
  const first = recharges.recordWebhookEvent(payload, "a".repeat(128));
  assert.equal(first.duplicate, false);
  recharges.finishWebhookEvent(first.id, "temporary error");
  assert.equal(recharges.recordWebhookEvent(payload, "a".repeat(128)).duplicate, false);
  recharges.finishWebhookEvent(first.id);
  assert.equal(recharges.recordWebhookEvent(payload, "a".repeat(128)).duplicate, true);
});