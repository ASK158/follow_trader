import { createHash, randomBytes } from "node:crypto";
import { getMarketplaceDb } from "@/lib/marketplace/db";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

export function clientIpHash(request: Request): string {
  return sha256(`${process.env.AUTH_AUDIT_PEPPER ?? "sigma-local"}:${clientIp(request)}`);
}

export function assertSameOrigin(request: Request): Response | null {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
    return Response.json({ error: "不允许跨站调用" }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (!origin) {
    if (process.env.NODE_ENV === "production") return Response.json({ error: "请求来源无法验证" }, { status: 403 });
    return null;
  }
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const expectedOrigin = forwardedHost ? `${forwardedProto || requestUrl.protocol.replace(":", "") }://${forwardedHost}` : requestUrl.origin;
  if (origin !== expectedOrigin) return Response.json({ error: "请求来源不匹配" }, { status: 403 });
  return null;
}

export function consumeRateLimit(scope: string, identifier: string, limit: number, windowMs: number): { limited: boolean; retryAfter: number } {
  const db = getMarketplaceDb();
  const key = sha256(`${process.env.AUTH_RATE_LIMIT_PEPPER ?? "sigma-local"}:${identifier.toLowerCase()}`);
  const now = Date.now();
  const row = db.prepare("SELECT count, reset_at FROM auth_rate_limits WHERE scope = ? AND identifier_hash = ?").get(scope, key) as { count: number; reset_at: number } | undefined;
  if (!row || row.reset_at <= now) {
    db.prepare("INSERT INTO auth_rate_limits (scope, identifier_hash, count, reset_at) VALUES (?, ?, 1, ?) ON CONFLICT(scope, identifier_hash) DO UPDATE SET count = 1, reset_at = excluded.reset_at").run(scope, key, now + windowMs);
    return { limited: false, retryAfter: 0 };
  }
  db.prepare("UPDATE auth_rate_limits SET count = count + 1 WHERE scope = ? AND identifier_hash = ?").run(scope, key);
  return { limited: row.count >= limit, retryAfter: Math.max(1, Math.ceil((row.reset_at - now) / 1000)) };
}

export function clearRateLimit(scope: string, identifier: string): void {
  const key = sha256(`${process.env.AUTH_RATE_LIMIT_PEPPER ?? "sigma-local"}:${identifier.toLowerCase()}`);
  getMarketplaceDb().prepare("DELETE FROM auth_rate_limits WHERE scope = ? AND identifier_hash = ?").run(scope, key);
}

export function audit(action: string, targetType: string, targetId: string | null, actorUserId: string | null, request?: Request, metadata: Record<string, unknown> = {}): void {
  getMarketplaceDb().prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, ip_hash, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(`audit-${randomBytes(10).toString("hex")}`, actorUserId, action, targetType, targetId, request ? clientIpHash(request) : null, JSON.stringify(metadata), new Date().toISOString());
}
