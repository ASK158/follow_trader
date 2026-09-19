import { randomBytes } from "node:crypto";
import { getMarketplaceDb } from "./db";

export type GaTransactionType = "admin_grant" | "admin_deduct" | "purchase" | "refund" | "agent_charge" | "agent_refund" | "crypto_recharge";

export type GaTransaction = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  actorName: string | null;
  type: GaTransactionType;
  amount: number;
  balanceAfter: number;
  orderId: string | null;
  reason: string;
  createdAt: string;
};

export type FinanceSummary = {
  totalBalance: number;
  totalRecharged: number;
  totalGranted: number;
  totalSpent: number;
  agentSpent: number;
  agentPaidRequestCount: number;
  agentFreeRequestCount: number;
  agentChatRequestCount: number;
  agentModifyRequestCount: number;
  agentGenerateRequestCount: number;
  confirmedOrderCount: number;
  confirmedOrderVolume: number;
};

type TransactionRow = {
  id: string; user_id: string; user_name: string; user_email: string; actor_name: string | null;
  type: GaTransactionType; amount: number; balance_after: number; order_id: string | null; reason: string; created_at: string;
};

function rowToTransaction(row: TransactionRow): GaTransaction {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    actorName: row.actor_name,
    type: row.type,
    amount: row.amount,
    balanceAfter: row.balance_after,
    orderId: row.order_id,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

export function getGaBalance(userId: string): number | null {
  const row = getMarketplaceDb().prepare("SELECT ga_balance FROM developers WHERE id = ?").get(userId) as { ga_balance: number } | undefined;
  return row?.ga_balance ?? null;
}

export function adjustGaBalance(
  actorUserId: string,
  userId: string,
  operation: "grant" | "deduct",
  amount: number,
  reason: string,
): { ok: true; balance: number; transactionId: string } | { ok: false; error: string } {
  if (!Number.isSafeInteger(amount) || amount <= 0) return { ok: false, error: "积分必须是大于 0 的整数" };
  const normalizedReason = reason.trim();
  if (normalizedReason.length < 2 || normalizedReason.length > 200) return { ok: false, error: "请填写 2 至 200 字的调整原因" };
  const db = getMarketplaceDb();
  const result = db.transaction(() => {
    const user = db.prepare("SELECT ga_balance FROM developers WHERE id = ?").get(userId) as { ga_balance: number } | undefined;
    if (!user) return { ok: false as const, error: "用户不存在" };
    const delta = operation === "grant" ? amount : -amount;
    const balance = user.ga_balance + delta;
    if (balance < 0) return { ok: false as const, error: "用户 Gas 余额不足，无法扣减" };
    const id = `ga-${randomBytes(10).toString("hex")}`;
    const now = new Date().toISOString();
    db.prepare("UPDATE developers SET ga_balance = ?, updated_at = ? WHERE id = ?").run(balance, now, userId);
    db.prepare(`
      INSERT INTO ga_transactions (id, user_id, actor_user_id, type, amount, balance_after, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, actorUserId, operation === "grant" ? "admin_grant" : "admin_deduct", delta, balance, normalizedReason, now);
    return { ok: true as const, balance, transactionId: id };
  })();
  return result;
}

export function listGaTransactions(limit = 300, userId?: string): GaTransaction[] {
  const safeLimit = Math.max(1, Math.min(1000, Math.trunc(limit)));
  const rows = getMarketplaceDb().prepare(`
    SELECT transactions.*, users.name AS user_name, users.email AS user_email, actors.name AS actor_name
    FROM ga_transactions transactions
    JOIN developers users ON users.id = transactions.user_id
    LEFT JOIN developers actors ON actors.id = transactions.actor_user_id
    ${userId ? "WHERE transactions.user_id = ?" : ""}
    ORDER BY transactions.created_at DESC LIMIT ?
  `).all(...(userId ? [userId, safeLimit] : [safeLimit])) as TransactionRow[];
  return rows.map(rowToTransaction);
}

export function getFinanceSummary(): FinanceSummary {
  const row = getMarketplaceDb().prepare(`
    SELECT
      (SELECT COALESCE(SUM(ga_balance), 0) FROM developers) AS total_balance,
      (SELECT COALESCE(SUM(gas_cents), 0) / 100.0 FROM crypto_recharges WHERE status = 'credited') AS total_recharged,
      (SELECT COALESCE(SUM(amount), 0) FROM ga_transactions WHERE type = 'admin_grant') AS total_granted,
      (SELECT COALESCE(-SUM(amount), 0) FROM ga_transactions WHERE type = 'purchase')
        + (SELECT COALESCE(SUM(gas_amount), 0) FROM agent_billing_requests WHERE status = 'committed' AND source = 'gas') AS total_spent,
      (SELECT COALESCE(SUM(gas_amount), 0) FROM agent_billing_requests WHERE status = 'committed' AND source = 'gas') AS agent_spent,
      (SELECT COUNT(*) FROM agent_billing_requests WHERE status = 'committed' AND source = 'gas') AS agent_paid_request_count,
      (SELECT COUNT(*) FROM agent_billing_requests WHERE status = 'committed' AND source = 'free') AS agent_free_request_count,
      (SELECT COUNT(*) FROM agent_billing_requests WHERE status = 'committed' AND action = 'chat') AS agent_chat_request_count,
      (SELECT COUNT(*) FROM agent_billing_requests WHERE status = 'committed' AND action = 'modify') AS agent_modify_request_count,
      (SELECT COUNT(*) FROM agent_billing_requests WHERE status = 'committed' AND action = 'generate') AS agent_generate_request_count,
      (SELECT COUNT(*) FROM orders WHERE status = 'confirmed') AS confirmed_order_count,
      (SELECT COALESCE(SUM(amount), 0) FROM orders WHERE status = 'confirmed') AS confirmed_order_volume
  `).get() as { total_balance: number; total_recharged: number; total_granted: number; total_spent: number; agent_spent: number; agent_paid_request_count: number; agent_free_request_count: number; agent_chat_request_count: number; agent_modify_request_count: number; agent_generate_request_count: number; confirmed_order_count: number; confirmed_order_volume: number };
  return {
    totalBalance: row.total_balance,
    totalRecharged: row.total_recharged,
    totalGranted: row.total_granted,
    totalSpent: row.total_spent,
    agentSpent: row.agent_spent,
    agentPaidRequestCount: row.agent_paid_request_count,
    agentFreeRequestCount: row.agent_free_request_count,
    agentChatRequestCount: row.agent_chat_request_count,
    agentModifyRequestCount: row.agent_modify_request_count,
    agentGenerateRequestCount: row.agent_generate_request_count,
    confirmedOrderCount: row.confirmed_order_count,
    confirmedOrderVolume: row.confirmed_order_volume,
  };
}