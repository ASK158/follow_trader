import { createHash, randomBytes } from "node:crypto";
import { getMarketplaceDb } from "@/lib/marketplace/db";
import { roundGas } from "@/lib/marketplace/currency";
import { createNowPaymentsPayment, getNowPaymentsMinimumAmount, getNowPaymentsPayment, NOWPAYMENTS_CURRENCY, type NowPaymentsPayment } from "./nowpayments";

export const RECHARGE_MIN_USDT = 2;
export const RECHARGE_MAX_USDT = 500;

export class RechargeAmountError extends Error {}

export type RechargeStatus = "creating" | "waiting" | "confirming" | "confirmed" | "sending" | "review_required" | "credited" | "expired" | "failed" | "cancelled";
export type Recharge = {
  id: string; amount: number; gasAmount: number; status: RechargeStatus; providerStatus: string | null;
  paymentId: string | null; payAddress: string | null; payAmount: string | null; actuallyPaid: string | null;
  expiresAt: string | null; creditedAt: string | null; createdAt: string; updatedAt: string;
};

type RechargeRow = { id: string; amount_cents: number; gas_cents: number; status: RechargeStatus; provider_status: string | null; provider_payment_id: string | null; pay_address: string | null; pay_amount: string | null; actually_paid: string | null; expires_at: string | null; credited_at: string | null; created_at: string; updated_at: string };

function toRecharge(row: RechargeRow): Recharge {
  return { id: row.id, amount: row.amount_cents / 100, gasAmount: row.gas_cents / 100, status: row.status, providerStatus: row.provider_status, paymentId: row.provider_payment_id, payAddress: row.pay_address, payAmount: row.pay_amount, actuallyPaid: row.actually_paid, expiresAt: row.expires_at, creditedAt: row.credited_at, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function amountToCents(amount: number): number {
  const cents = Math.round((amount + Number.EPSILON) * 100);
  if (!Number.isFinite(amount) || Math.abs(amount - cents / 100) > 1e-9 || cents < 200 || cents > 50_000) throw new Error("充值金额必须为 2.00 至 500.00 USDT，最多两位小数");
  return cents;
}

export async function createRecharge(userId: string, amount: number): Promise<Recharge> {
  const amountCents = amountToCents(amount);
  const minimum = await getNowPaymentsMinimumAmount();
  if (amount + 1e-9 < minimum) throw new RechargeAmountError(`NOWPayments 当前最低充值金额约为 ${minimum.toFixed(2)} USDT，请提高金额后重试`);
  const db = getMarketplaceDb();
  const id = `rcg-${randomBytes(12).toString("hex")}`;
  const now = new Date().toISOString();
  db.prepare("INSERT INTO crypto_recharges (id, user_id, amount_cents, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, userId, amountCents, now, now);
  try {
    const payment = await createNowPaymentsPayment(id, amountCents / 100);
    const paymentId = String(payment.payment_id);
    if (!paymentId || !payment.pay_address || !Number.isFinite(Number(payment.pay_amount))) throw new Error("NOWPayments 返回的支付信息不完整");
    if (payment.pay_currency.toLowerCase() !== NOWPAYMENTS_CURRENCY || payment.price_currency.toLowerCase() !== NOWPAYMENTS_CURRENCY) throw new Error("NOWPayments 返回的币种与 USDT-TRC20 不一致");
    if (payment.order_id && payment.order_id !== id) throw new Error("NOWPayments 返回的订单号不一致");
    const expiresAt = payment.expiration_estimate_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`UPDATE crypto_recharges SET provider_payment_id = ?, pay_address = ?, pay_amount = ?, provider_status = ?, status = 'waiting', expires_at = ?, updated_at = ? WHERE id = ?`)
      .run(paymentId, payment.pay_address, String(payment.pay_amount), payment.payment_status, expiresAt, new Date().toISOString(), id);
  } catch (error) {
    db.prepare("UPDATE crypto_recharges SET status = 'failed', provider_status = 'creation_failed', updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
    throw error;
  }
  return getRecharge(id, userId)!;
}

export function getRecharge(id: string, userId?: string): Recharge | null {
  const row = getMarketplaceDb().prepare(`SELECT * FROM crypto_recharges WHERE id = ? ${userId ? "AND user_id = ?" : ""}`).get(...(userId ? [id, userId] : [id])) as RechargeRow | undefined;
  return row ? toRecharge(row) : null;
}

export function listUserRecharges(userId: string, limit = 50): Recharge[] {
  const rows = getMarketplaceDb().prepare("SELECT * FROM crypto_recharges WHERE user_id = ? ORDER BY created_at DESC LIMIT ?").all(userId, Math.max(1, Math.min(200, Math.trunc(limit)))) as RechargeRow[];
  return rows.map(toRecharge);
}

export type AdminRecharge = Recharge & { userName: string; userEmail: string };
export function listAdminRecharges(limit = 200): AdminRecharge[] {
  const rows = getMarketplaceDb().prepare(`SELECT recharges.*, users.name AS user_name, users.email AS user_email FROM crypto_recharges recharges JOIN developers users ON users.id = recharges.user_id ORDER BY recharges.created_at DESC LIMIT ?`).all(Math.max(1, Math.min(1000, Math.trunc(limit)))) as Array<RechargeRow & { user_name: string; user_email: string }>;
  return rows.map((row) => ({ ...toRecharge(row), userName: row.user_name, userEmail: row.user_email }));
}

function localStatus(providerStatus: string): RechargeStatus {
  if (providerStatus === "finished") return "credited";
  if (providerStatus === "confirming") return "confirming";
  if (providerStatus === "confirmed") return "confirmed";
  if (providerStatus === "sending") return "sending";
  if (providerStatus === "expired") return "expired";
  if (providerStatus === "failed") return "failed";
  if (providerStatus === "cancelled") return "cancelled";
  if (providerStatus === "partially_paid" || providerStatus === "wrong_asset_confirmed") return "review_required";
  return "waiting";
}

export function applyVerifiedPayment(payment: NowPaymentsPayment): { status: RechargeStatus; credited: boolean; rechargeId: string } {
  const db = getMarketplaceDb();
  const paymentId = String(payment.payment_id);
  const row = db.prepare("SELECT * FROM crypto_recharges WHERE provider_payment_id = ?").get(paymentId) as (RechargeRow & { user_id: string; ga_transaction_id: string | null }) | undefined;
  if (!row) throw new Error("找不到对应的充值单");
  if (payment.order_id !== row.id) throw new Error("NOWPayments 订单号不匹配");
  if (payment.parent_payment_id || payment.payment_status === "wrong_asset_confirmed" || payment.pay_currency.toLowerCase() !== NOWPAYMENTS_CURRENCY) {
    db.prepare("UPDATE crypto_recharges SET provider_parent_payment_id = ?, provider_status = ?, status = 'review_required', actually_paid = ?, updated_at = ? WHERE id = ?")
      .run(payment.parent_payment_id ? String(payment.parent_payment_id) : null, payment.payment_status, String(payment.actually_paid ?? 0), new Date().toISOString(), row.id);
    return { status: "review_required", credited: false, rechargeId: row.id };
  }
  if (payment.price_currency.toLowerCase() !== NOWPAYMENTS_CURRENCY || Math.abs(Number(payment.price_amount) - row.amount_cents / 100) > 0.001) throw new Error("NOWPayments 订单金额不匹配");
  if (row.ga_transaction_id) return { status: "credited", credited: false, rechargeId: row.id };
  const status = localStatus(payment.payment_status);
  const actuallyPaid = Number(payment.actually_paid ?? 0);
  const expected = row.amount_cents / 100;
  if (status !== "credited" || !Number.isFinite(actuallyPaid) || actuallyPaid + 1e-9 < expected) {
    const safeStatus = status === "credited" ? "review_required" : status;
    db.prepare("UPDATE crypto_recharges SET provider_status = ?, status = ?, actually_paid = ?, updated_at = ? WHERE id = ?")
      .run(payment.payment_status, safeStatus, String(payment.actually_paid ?? 0), new Date().toISOString(), row.id);
    return { status: safeStatus, credited: false, rechargeId: row.id };
  }
  return db.transaction(() => {
    const fresh = db.prepare("SELECT user_id, amount_cents, ga_transaction_id FROM crypto_recharges WHERE id = ?").get(row.id) as { user_id: string; amount_cents: number; ga_transaction_id: string | null };
    if (fresh.ga_transaction_id) return { status: "credited" as const, credited: false, rechargeId: row.id };
    const user = db.prepare("SELECT ga_balance FROM developers WHERE id = ?").get(fresh.user_id) as { ga_balance: number } | undefined;
    if (!user) throw new Error("充值用户不存在");
    const gasAmount = fresh.amount_cents / 100;
    const balance = roundGas(user.ga_balance + gasAmount);
    const transactionId = `ga-${randomBytes(10).toString("hex")}`;
    const creditedAt = new Date().toISOString();
    db.prepare("UPDATE developers SET ga_balance = ?, updated_at = ? WHERE id = ?").run(balance, creditedAt, fresh.user_id);
    db.prepare(`INSERT INTO ga_transactions (id, user_id, type, amount, balance_after, reason, created_at) VALUES (?, ?, 'crypto_recharge', ?, ?, ?, ?)`)
      .run(transactionId, fresh.user_id, gasAmount, balance, `USDT-TRC20 充值 ${row.id}`, creditedAt);
    db.prepare("UPDATE crypto_recharges SET provider_status = ?, status = 'credited', actually_paid = ?, gas_cents = amount_cents, ga_transaction_id = ?, credited_at = ?, updated_at = ? WHERE id = ?")
      .run(payment.payment_status, String(payment.actually_paid ?? expected), transactionId, creditedAt, creditedAt, row.id);
    return { status: "credited" as const, credited: true, rechargeId: row.id };
  })();
}

export async function synchronizeRecharge(paymentId: string) {
  return applyVerifiedPayment(await getNowPaymentsPayment(paymentId));
}

export async function reconcilePendingRecharges(limit = 500): Promise<{ checked: number; credited: number; failed: number }> {
  const rows = getMarketplaceDb().prepare("SELECT provider_payment_id FROM crypto_recharges WHERE provider_payment_id IS NOT NULL AND status NOT IN ('credited', 'expired', 'failed', 'cancelled') ORDER BY updated_at ASC LIMIT ?").all(Math.max(1, Math.min(1000, Math.trunc(limit)))) as Array<{ provider_payment_id: string }>;
  let credited = 0; let failed = 0;
  for (const row of rows) {
    try { if ((await synchronizeRecharge(row.provider_payment_id)).credited) credited += 1; } catch { failed += 1; }
  }
  return { checked: rows.length, credited, failed };
}

export function recordWebhookEvent(payload: unknown, signature: string): { id: string; duplicate: boolean } {
  const serialized = JSON.stringify(payload);
  const id = `np-${createHash("sha256").update(`${signature}:${serialized}`).digest("hex")}`;
  const paymentId = payload && typeof payload === "object" && "payment_id" in payload ? String((payload as { payment_id: unknown }).payment_id) : null;
  const result = getMarketplaceDb().prepare("INSERT OR IGNORE INTO crypto_webhook_events (id, provider_payment_id, signature, payload, received_at) VALUES (?, ?, ?, ?, ?)").run(id, paymentId, signature, serialized, new Date().toISOString());
  if (result.changes > 0) return { id, duplicate: false };
  const existing = getMarketplaceDb().prepare("SELECT status FROM crypto_webhook_events WHERE id = ?").get(id) as { status: "received" | "processed" | "failed" };
  if (existing.status !== "processed") getMarketplaceDb().prepare("UPDATE crypto_webhook_events SET status = 'received', error = NULL, processed_at = NULL WHERE id = ?").run(id);
  return { id, duplicate: existing.status === "processed" };
}

export function finishWebhookEvent(id: string, error?: string): void {
  getMarketplaceDb().prepare("UPDATE crypto_webhook_events SET status = ?, error = ?, processed_at = ? WHERE id = ?").run(error ? "failed" : "processed", error?.slice(0, 500) ?? null, new Date().toISOString(), id);
}