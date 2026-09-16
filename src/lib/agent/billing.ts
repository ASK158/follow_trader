import { randomBytes } from "node:crypto";
import { getMarketplaceDb } from "@/lib/marketplace/db";
import { getAgentMaximumPreauthorization, getPlatformSettings, type AgentAction } from "@/lib/platform-settings";

export type AgentPricing = {
  freeUsageLimit: number;
  chatCost: number;
  modifyCost: number;
  generateCost: number;
  minimumGasToStart: number;
};

export type AgentBillingStatus = {
  freeRemaining: number;
  freeEligible: boolean;
  gasBalance: number;
  isAdmin: boolean;
  pricing: AgentPricing;
};

export type AgentBillingReservation = AgentBillingStatus & {
  requestId: string;
  source: "free" | "gas" | "admin";
  reservedGasAmount: number;
};

export class AgentInsufficientGasError extends Error {
  constructor(public readonly status: AgentBillingStatus) {
    super(`免费体验次数已用完，请求发起前账户至少需要 ${status.pricing.minimumGasToStart} Gas`);
  }
}

export class DuplicateAgentRequestError extends Error {
  constructor() {
    super("该 Agent 请求已处理，请勿重复提交");
  }
}

type BillingUserRow = { ga_balance: number; role: "user" | "admin"; agent_free_eligible: number; used_count: number };

function roundGas(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function pricing(): AgentPricing {
  const settings = getPlatformSettings();
  return {
    freeUsageLimit: Math.trunc(settings.agentFreeUsageLimit),
    chatCost: settings.agentChatCost,
    modifyCost: settings.agentModifyCost,
    generateCost: settings.agentGenerateCost,
    minimumGasToStart: settings.agentMinimumGasToStart,
  };
}

function statusFromRow(row: BillingUserRow): AgentBillingStatus {
  const currentPricing = pricing();
  const freeEligible = row.role === "admin" || Boolean(row.agent_free_eligible);
  return {
    freeRemaining: row.role === "admin" ? currentPricing.freeUsageLimit : freeEligible ? Math.max(0, currentPricing.freeUsageLimit - row.used_count) : 0,
    freeEligible,
    gasBalance: roundGas(row.ga_balance),
    isAdmin: row.role === "admin",
    pricing: currentPricing,
  };
}

function getBillingUser(userId: string): BillingUserRow {
  const row = getMarketplaceDb().prepare(`
    SELECT developers.ga_balance, developers.role, developers.agent_free_eligible,
      COALESCE(agent_free_usage.used_count, developers.agent_free_uses, 0) AS used_count
    FROM developers LEFT JOIN agent_free_usage ON agent_free_usage.user_id = developers.id
    WHERE developers.id = ?
  `).get(userId) as BillingUserRow | undefined;
  if (!row) throw new Error("Agent 计费账户不存在");
  return row;
}

export function getAgentBillingStatus(userId: string): AgentBillingStatus {
  return statusFromRow(getBillingUser(userId));
}

export function reserveAgentUsage(userId: string, requestId: string): AgentBillingReservation {
  const db = getMarketplaceDb();
  return db.transaction(() => {
    if (db.prepare("SELECT 1 FROM agent_billing_requests WHERE request_id = ?").get(requestId)) throw new DuplicateAgentRequestError();
    const user = getBillingUser(userId);
    const settings = getPlatformSettings();
    const freeLimit = Math.trunc(settings.agentFreeUsageLimit);
    const now = new Date().toISOString();
    let source: AgentBillingReservation["source"] = "admin";
    let reservedGasAmount = 0;
    let chargeTransactionId: string | null = null;
    if (user.role !== "admin" && user.agent_free_eligible && user.used_count < freeLimit) {
      source = "free";
      db.prepare(`
        INSERT INTO agent_free_usage (user_id, used_count, updated_at) VALUES (?, 1, ?)
        ON CONFLICT(user_id) DO UPDATE SET used_count = used_count + 1, updated_at = excluded.updated_at
      `).run(userId, now);
      user.used_count += 1;
    } else if (user.role !== "admin") {
      reservedGasAmount = roundGas(getAgentMaximumPreauthorization(settings));
      if (user.ga_balance < settings.agentMinimumGasToStart || user.ga_balance < reservedGasAmount) throw new AgentInsufficientGasError(statusFromRow(user));
      source = "gas";
      user.ga_balance = roundGas(user.ga_balance - reservedGasAmount);
      chargeTransactionId = `ga-${randomBytes(10).toString("hex")}`;
      db.prepare("UPDATE developers SET ga_balance = ?, updated_at = ? WHERE id = ?").run(user.ga_balance, now, userId);
      db.prepare(`
        INSERT INTO ga_transactions (id, user_id, type, amount, balance_after, reason, created_at)
        VALUES (?, ?, 'agent_charge', ?, ?, 'Agent 请求预授权', ?)
      `).run(chargeTransactionId, userId, -reservedGasAmount, user.ga_balance, now);
    }
    const billingStatus = statusFromRow(user);
    db.prepare(`
      INSERT INTO agent_billing_requests (request_id, user_id, source, action, reserved_gas_amount, gas_amount, pricing_json, charge_transaction_id, created_at, updated_at)
      VALUES (?, ?, ?, 'generate', ?, 0, ?, ?, ?, ?)
    `).run(requestId, userId, source, reservedGasAmount, JSON.stringify(billingStatus.pricing), chargeTransactionId, now, now);
    return { ...billingStatus, requestId, source, reservedGasAmount };
  })();
}

export function commitAgentUsage(userId: string, requestId: string, action: AgentAction): AgentBillingStatus {
  const db = getMarketplaceDb();
  return db.transaction(() => {
    const reservation = db.prepare(`
      SELECT source, reserved_gas_amount, pricing_json FROM agent_billing_requests
      WHERE request_id = ? AND user_id = ? AND status = 'reserved'
    `).get(requestId, userId) as { source: "free" | "gas" | "admin"; reserved_gas_amount: number; pricing_json: string } | undefined;
    if (!reservation) throw new Error("Agent 计费预占不存在或已结算");
    let priceSnapshot: AgentPricing;
    try { priceSnapshot = { ...pricing(), ...JSON.parse(reservation.pricing_json) as Partial<AgentPricing> }; } catch { priceSnapshot = pricing(); }
    const finalCost = reservation.source === "gas" ? roundGas(action === "chat" ? priceSnapshot.chatCost : action === "modify" ? priceSnapshot.modifyCost : priceSnapshot.generateCost) : 0;
    if (finalCost > reservation.reserved_gas_amount) throw new Error("Agent 实际费用超过预授权金额，请联系管理员检查价格配置");
    const now = new Date().toISOString();
    let refundTransactionId: string | null = null;
    const refund = roundGas(reservation.reserved_gas_amount - finalCost);
    if (reservation.source === "gas" && refund > 0) {
      const current = getBillingUser(userId);
      const balance = roundGas(current.ga_balance + refund);
      refundTransactionId = `ga-${randomBytes(10).toString("hex")}`;
      db.prepare("UPDATE developers SET ga_balance = ?, updated_at = ? WHERE id = ?").run(balance, now, userId);
      db.prepare(`
        INSERT INTO ga_transactions (id, user_id, type, amount, balance_after, reason, created_at)
        VALUES (?, ?, 'agent_refund', ?, ?, 'Agent 预授权差额退还', ?)
      `).run(refundTransactionId, userId, refund, balance, now);
    }
    db.prepare(`
      UPDATE agent_billing_requests SET status = 'committed', action = ?, gas_amount = ?, refund_transaction_id = ?, updated_at = ?
      WHERE request_id = ? AND user_id = ? AND status = 'reserved'
    `).run(action, finalCost, refundTransactionId, now, requestId, userId);
    return getAgentBillingStatus(userId);
  })();
}

export function releaseAgentUsage(userId: string, requestId: string): AgentBillingStatus {
  const db = getMarketplaceDb();
  return db.transaction(() => {
    const reservation = db.prepare(`
      SELECT source, reserved_gas_amount FROM agent_billing_requests
      WHERE request_id = ? AND user_id = ? AND status = 'reserved'
    `).get(requestId, userId) as { source: "free" | "gas" | "admin"; reserved_gas_amount: number } | undefined;
    if (!reservation) return getAgentBillingStatus(userId);
    const now = new Date().toISOString();
    let refundTransactionId: string | null = null;
    if (reservation.source === "free") {
      db.prepare("UPDATE agent_free_usage SET used_count = MAX(used_count - 1, 0), updated_at = ? WHERE user_id = ?").run(now, userId);
    } else if (reservation.source === "gas") {
      const current = getBillingUser(userId);
      const balance = roundGas(current.ga_balance + reservation.reserved_gas_amount);
      refundTransactionId = `ga-${randomBytes(10).toString("hex")}`;
      db.prepare("UPDATE developers SET ga_balance = ?, updated_at = ? WHERE id = ?").run(balance, now, userId);
      db.prepare(`
        INSERT INTO ga_transactions (id, user_id, type, amount, balance_after, reason, created_at)
        VALUES (?, ?, 'agent_refund', ?, ?, 'Agent 请求失败，退还预授权', ?)
      `).run(refundTransactionId, userId, reservation.reserved_gas_amount, balance, now);
    }
    db.prepare("UPDATE agent_billing_requests SET status = 'released', gas_amount = 0, refund_transaction_id = ?, updated_at = ? WHERE request_id = ?").run(refundTransactionId, now, requestId);
    return getAgentBillingStatus(userId);
  })();
}

export function releaseStaleAgentReservations(userId: string, maxAgeMs = 30 * 60 * 1000): number {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const rows = getMarketplaceDb().prepare("SELECT request_id FROM agent_billing_requests WHERE user_id = ? AND status = 'reserved' AND created_at < ?").all(userId, cutoff) as Array<{ request_id: string }>;
  for (const row of rows) releaseAgentUsage(userId, row.request_id);
  return rows.length;
}

export type AgentBillingRecord = {
  requestId: string;
  source: "free" | "gas" | "admin";
  status: "reserved" | "committed" | "released";
  action: "chat" | "modify" | "generate";
  gasAmount: number;
  reservedGasAmount: number;
  createdAt: string;
  updatedAt: string;
};

export function listUserAgentBillingRequests(userId: string, limit = 100): AgentBillingRecord[] {
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  const rows = getMarketplaceDb().prepare(`
    SELECT request_id, source, status, action, gas_amount, reserved_gas_amount, created_at, updated_at
    FROM agent_billing_requests
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, safeLimit) as Array<{
    request_id: string;
    source: "free" | "gas" | "admin";
    status: "reserved" | "committed" | "released";
    action: "chat" | "modify" | "generate";
    gas_amount: number;
    reserved_gas_amount: number;
    created_at: string;
    updated_at: string;
  }>;
  return rows.map((row) => ({
    requestId: row.request_id,
    source: row.source,
    status: row.status,
    action: row.action,
    gasAmount: roundGas(row.gas_amount),
    reservedGasAmount: roundGas(row.reserved_gas_amount),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
