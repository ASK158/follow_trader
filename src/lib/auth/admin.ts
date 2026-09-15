import { getMarketplaceDb } from "@/lib/marketplace/db";
import type { UserRole, UserStatus } from "@/lib/marketplace/auth";

export type AdminUserRecord = { id: string; email: string; name: string; gaBalance: number; role: UserRole; status: UserStatus; emailVerified: boolean; mfaEnabled: boolean; agentFreeEligible: boolean; registrationRiskScore: number; registrationRiskFlags: string[]; createdAt: string; lastLoginAt: string | null; productCount: number; orderCount: number };
export type AuditRecord = { id: string; actorName: string | null; action: string; targetType: string; targetId: string | null; metadata: string; createdAt: string };

export function listAdminUsers(): AdminUserRecord[] {
  const rows = getMarketplaceDb().prepare(`
    SELECT d.id, d.email, d.name, d.ga_balance, d.role, d.status, d.email_verified_at, d.totp_enabled,
      d.agent_free_eligible, d.registration_risk_score, d.registration_risk_flags, d.created_at, d.last_login_at,
      (SELECT COUNT(*) FROM products WHERE products.developer_id = d.id) AS product_count,
      (SELECT COUNT(*) FROM orders WHERE orders.buyer_user_id = d.id) AS order_count
    FROM developers d ORDER BY d.created_at DESC LIMIT 500
  `).all() as Array<{ id: string; email: string; name: string; ga_balance: number; role: UserRole; status: UserStatus; email_verified_at: string | null; totp_enabled: number; agent_free_eligible: number; registration_risk_score: number; registration_risk_flags: string; created_at: string; last_login_at: string | null; product_count: number; order_count: number }>;
  return rows.map((row) => ({ id: row.id, email: row.email, name: row.name, gaBalance: row.ga_balance, role: row.role, status: row.status, emailVerified: Boolean(row.email_verified_at), mfaEnabled: Boolean(row.totp_enabled), agentFreeEligible: Boolean(row.agent_free_eligible), registrationRiskScore: row.registration_risk_score, registrationRiskFlags: JSON.parse(row.registration_risk_flags || "[]") as string[], createdAt: row.created_at, lastLoginAt: row.last_login_at, productCount: row.product_count, orderCount: row.order_count }));
}

export function listAuditLogs(): AuditRecord[] {
  const rows = getMarketplaceDb().prepare(`
    SELECT logs.id, users.name AS actor_name, logs.action, logs.target_type, logs.target_id, logs.metadata, logs.created_at
    FROM audit_logs logs LEFT JOIN developers users ON users.id = logs.actor_user_id
    ORDER BY logs.created_at DESC LIMIT 300
  `).all() as Array<{ id: string; actor_name: string | null; action: string; target_type: string; target_id: string | null; metadata: string; created_at: string }>;
  return rows.map((row) => ({ id: row.id, actorName: row.actor_name, action: row.action, targetType: row.target_type, targetId: row.target_id, metadata: row.metadata, createdAt: row.created_at }));
}

export function updateUserAccess(actorId: string, targetId: string, role: UserRole, status: UserStatus): { ok: boolean; error?: string } {
  const db = getMarketplaceDb();
  const target = db.prepare("SELECT role, email_verified_at FROM developers WHERE id = ?").get(targetId) as { role: UserRole; email_verified_at: string | null } | undefined;
  if (!target) return { ok: false, error: "用户不存在" };
  if (role === "admin" && !target.email_verified_at) return { ok: false, error: "未验证邮箱的用户不能设为管理员" };
  if (actorId === targetId && (role !== "admin" || status !== "active")) return { ok: false, error: "不能停用或降级当前管理员账户" };
  if (target.role === "admin" && (role !== "admin" || status !== "active")) {
    const activeAdmins = db.prepare("SELECT COUNT(*) AS count FROM developers WHERE role = 'admin' AND status = 'active'").get() as { count: number };
    if (activeAdmins.count <= 1) return { ok: false, error: "必须保留至少一个启用的管理员" };
  }
  db.prepare("UPDATE developers SET role = ?, status = ?, updated_at = ? WHERE id = ?").run(role, status, new Date().toISOString(), targetId);
  if (status === "suspended") db.prepare("DELETE FROM sessions WHERE developer_id = ?").run(targetId);
  return { ok: true };
}
