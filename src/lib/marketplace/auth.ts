import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { audit, clientIpHash, sha256 } from "@/lib/auth/security";
import { decryptSecret, encryptSecret, generateTotpSecret, totpUri, verifyTotp } from "@/lib/auth/totp";
import { getMarketplaceDb } from "./db";
import { mergeVisitorFavoritesIntoUser } from "./products";

export type UserRole = "user" | "admin";
export type UserStatus = "active" | "suspended";
export type ProfileVisibility = "public" | "signed_in" | "followers" | "private";
export type RelationVisibility = "public" | "followers" | "private";
export type MessagePermission = "everyone" | "followers" | "mutual" | "none";
export type User = {
  id: string;
  email: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  bio: string;
  contact: string;
  websiteUrl: string;
  location: string;
  contactVisibility: ProfileVisibility;
  followersVisibility: RelationVisibility;
  followingVisibility: RelationVisibility;
  favoritesVisibility: "public" | "private";
  messagePermission: MessagePermission;
  gaBalance: number;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  mfaEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

/** @deprecated 统一账户已使用 User；保留别名以兼容商品模块。 */
export type Developer = User;

type UserRow = {
  id: string; email: string; password_hash: string; name: string; role: UserRole; status: UserStatus;
  username: string | null; avatar_filename: string | null; bio: string; contact: string; website_url: string; location: string;
  contact_visibility: ProfileVisibility; followers_visibility: RelationVisibility; following_visibility: RelationVisibility;
  favorites_visibility: "public" | "private"; message_permission: MessagePermission;
  ga_balance: number;
  email_verified_at: string | null; totp_secret: string | null; totp_enabled: number;
  created_at: string; last_login_at: string | null;
};

const scryptAsync = promisify(scrypt);
const SESSION_COOKIE = "user_session";
const LEGACY_SESSION_COOKIE = "developer_session";
const MFA_COOKIE = "mfa_challenge";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function shouldSecureCookies(): boolean {
  return process.env.NODE_ENV === "production" && process.env.AUTH_COOKIE_SECURE !== "false";
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = await scryptAsync(password, salt, 64) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = await scryptAsync(password, salt, 64) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function toUser(row: UserRow): User {
  return {
    id: row.id, email: row.email, name: row.name, username: row.username ?? `user_${row.id.slice(0, 12)}`,
    avatarUrl: row.avatar_filename ? `/api/users/${row.id}/avatar` : null,
    bio: row.bio ?? "", contact: row.contact ?? "", websiteUrl: row.website_url ?? "", location: row.location ?? "",
    contactVisibility: row.contact_visibility ?? "signed_in", followersVisibility: row.followers_visibility ?? "public",
    followingVisibility: row.following_visibility ?? "public", favoritesVisibility: row.favorites_visibility ?? "private",
    messagePermission: row.message_permission ?? "followers",
    gaBalance: row.ga_balance, role: row.role, status: row.status, emailVerified: Boolean(row.email_verified_at),
    mfaEnabled: Boolean(row.totp_enabled), createdAt: row.created_at, lastLoginAt: row.last_login_at,
  };
}

export async function registerUser(email: string, password: string, name: string): Promise<{ user?: User; error?: string }> {
  const db = getMarketplaceDb();
  if (db.prepare("SELECT id FROM developers WHERE email = ?").get(email)) return { error: "无法使用该邮箱完成注册" };
  const id = randomBytes(12).toString("hex");
  const username = `user_${id.slice(0, 12)}`;
  const now = new Date().toISOString();
  try {
    db.prepare("INSERT INTO developers (id, email, password_hash, name, username, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'user', 'active', ?, ?)").run(id, email, await hashPassword(password), name, username, now, now);
  } catch {
    return { error: "无法使用该邮箱完成注册" };
  }
  return { user: toUser(db.prepare("SELECT * FROM developers WHERE id = ?").get(id) as UserRow) };
}

export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const row = getMarketplaceDb().prepare("SELECT * FROM developers WHERE email = ?").get(email) as UserRow | undefined;
  if (!row || !(await verifyPassword(password, row.password_hash))) return null;
  return toUser(row);
}

export async function createSession(userId: string, request?: Request): Promise<void> {
  const db = getMarketplaceDb();
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const now = new Date().toISOString();
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
  db.prepare("INSERT INTO sessions (token, developer_id, expires_at, token_hash, created_at, last_seen_at, user_agent, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    `session-${randomBytes(12).toString("hex")}`, userId, expiresAt, sha256(token), now, now, request?.headers.get("user-agent")?.slice(0, 300) ?? null, request ? clientIpHash(request) : null,
  );
  db.prepare("UPDATE developers SET last_login_at = ?, updated_at = ? WHERE id = ?").run(now, now, userId);
  const store = await cookies();
  mergeVisitorFavoritesIntoUser(store.get("marketplace_visitor")?.value, userId);
  store.delete("marketplace_visitor");
  store.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "strict", secure: shouldSecureCookies(), path: "/", expires: new Date(expiresAt), priority: "high" });
  store.delete(LEGACY_SESSION_COOKIE);
}

export async function destroySession(request?: Request): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value ?? store.get(LEGACY_SESSION_COOKIE)?.value;
  if (token) {
    const db = getMarketplaceDb();
    const row = db.prepare("SELECT developer_id FROM sessions WHERE token_hash = ? OR token = ?").get(sha256(token), token) as { developer_id: string } | undefined;
    db.prepare("DELETE FROM sessions WHERE token_hash = ? OR token = ?").run(sha256(token), token);
    if (row) audit("auth.logout", "session", null, row.developer_id, request);
  }
  store.delete(SESSION_COOKIE);
  store.delete(LEGACY_SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value ?? store.get(LEGACY_SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getMarketplaceDb();
  const tokenHash = sha256(token);
  const row = db.prepare(`
    SELECT d.* FROM sessions s JOIN developers d ON d.id = s.developer_id
    WHERE (s.token_hash = ? OR (s.token_hash IS NULL AND s.token = ?)) AND s.expires_at > ? AND d.status = 'active'
  `).get(tokenHash, token, Date.now()) as UserRow | undefined;
  if (!row) return null;
  db.prepare("UPDATE sessions SET token_hash = COALESCE(token_hash, ?), last_seen_at = ? WHERE token_hash = ? OR token = ?").run(tokenHash, new Date().toISOString(), tokenHash, token);
  return toUser(row);
}

/** @deprecated 使用 getCurrentUser。 */
export const getCurrentDeveloper = getCurrentUser;

export function isAdmin(user: User | null): boolean {
  return user?.role === "admin" && user.status === "active";
}

export function issueAccountToken(userId: string, type: "verify_email" | "reset_password", ttlMs: number): string {
  const db = getMarketplaceDb();
  const token = randomBytes(32).toString("hex");
  db.prepare("DELETE FROM auth_tokens WHERE user_id = ? AND type = ?").run(userId, type);
  db.prepare("INSERT INTO auth_tokens (id, user_id, type, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    `token-${randomBytes(10).toString("hex")}`, userId, type, sha256(token), Date.now() + ttlMs, new Date().toISOString(),
  );
  return token;
}

export function findUserByEmail(email: string): User | null {
  const row = getMarketplaceDb().prepare("SELECT * FROM developers WHERE email = ?").get(email) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function verifyEmailToken(token: string): boolean {
  const db = getMarketplaceDb();
  const row = db.prepare("SELECT id, user_id FROM auth_tokens WHERE token_hash = ? AND type = 'verify_email' AND consumed_at IS NULL AND expires_at > ?").get(sha256(token), Date.now()) as { id: string; user_id: string } | undefined;
  if (!row) return false;
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare("UPDATE auth_tokens SET consumed_at = ? WHERE id = ?").run(now, row.id);
    db.prepare("UPDATE developers SET email_verified_at = ?, updated_at = ? WHERE id = ?").run(now, now, row.user_id);
  })();
  audit("auth.email_verified", "user", row.user_id, row.user_id);
  return true;
}

export async function resetPasswordWithToken(token: string, password: string): Promise<boolean> {
  const db = getMarketplaceDb();
  const row = db.prepare("SELECT id, user_id FROM auth_tokens WHERE token_hash = ? AND type = 'reset_password' AND consumed_at IS NULL AND expires_at > ?").get(sha256(token), Date.now()) as { id: string; user_id: string } | undefined;
  if (!row) return false;
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);
  db.transaction(() => {
    db.prepare("UPDATE developers SET password_hash = ?, updated_at = ? WHERE id = ?").run(passwordHash, now, row.user_id);
    db.prepare("UPDATE auth_tokens SET consumed_at = ? WHERE id = ?").run(now, row.id);
    db.prepare("DELETE FROM sessions WHERE developer_id = ?").run(row.user_id);
  })();
  audit("auth.password_reset", "user", row.user_id, row.user_id);
  return true;
}

export async function changePassword(userId: string, currentPassword: string, nextPassword: string): Promise<boolean> {
  const db = getMarketplaceDb();
  const row = db.prepare("SELECT * FROM developers WHERE id = ?").get(userId) as UserRow | undefined;
  if (!row || !(await verifyPassword(currentPassword, row.password_hash))) return false;
  db.prepare("UPDATE developers SET password_hash = ?, updated_at = ? WHERE id = ?").run(await hashPassword(nextPassword), new Date().toISOString(), userId);
  db.prepare("DELETE FROM sessions WHERE developer_id = ?").run(userId);
  audit("auth.password_changed", "user", userId, userId);
  return true;
}

export async function beginMfaChallenge(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  getMarketplaceDb().prepare("INSERT INTO mfa_challenges (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha256(token), userId, Date.now() + 5 * 60 * 1000);
  (await cookies()).set(MFA_COOKIE, token, { httpOnly: true, sameSite: "strict", secure: shouldSecureCookies(), path: "/", maxAge: 300 });
}

export async function completeMfaChallenge(code: string, request: Request): Promise<boolean> {
  const store = await cookies();
  const token = store.get(MFA_COOKIE)?.value;
  if (!token) return false;
  const db = getMarketplaceDb();
  const row = db.prepare("SELECT c.user_id, c.attempts, d.totp_secret FROM mfa_challenges c JOIN developers d ON d.id = c.user_id WHERE c.token_hash = ? AND c.expires_at > ?").get(sha256(token), Date.now()) as { user_id: string; attempts: number; totp_secret: string | null } | undefined;
  if (!row || row.attempts >= 5 || !row.totp_secret) return false;
  if (!verifyTotp(decryptSecret(row.totp_secret), code)) {
    db.prepare("UPDATE mfa_challenges SET attempts = attempts + 1 WHERE token_hash = ?").run(sha256(token));
    return false;
  }
  db.prepare("DELETE FROM mfa_challenges WHERE token_hash = ?").run(sha256(token));
  store.delete(MFA_COOKIE);
  await createSession(row.user_id, request);
  audit("auth.mfa_login", "user", row.user_id, row.user_id, request);
  return true;
}

export function createMfaSetup(user: User): { secret: string; uri: string } {
  const secret = generateTotpSecret();
  getMarketplaceDb().prepare("UPDATE developers SET totp_secret = ?, totp_enabled = 0, updated_at = ? WHERE id = ?").run(encryptSecret(secret), new Date().toISOString(), user.id);
  return { secret, uri: totpUri(secret, user.email) };
}

export function confirmMfaSetup(userId: string, code: string): boolean {
  const db = getMarketplaceDb();
  const row = db.prepare("SELECT totp_secret FROM developers WHERE id = ?").get(userId) as { totp_secret: string | null } | undefined;
  if (!row?.totp_secret || !verifyTotp(decryptSecret(row.totp_secret), code)) return false;
  db.prepare("UPDATE developers SET totp_enabled = 1, updated_at = ? WHERE id = ?").run(new Date().toISOString(), userId);
  audit("auth.mfa_enabled", "user", userId, userId);
  return true;
}

export function disableMfa(userId: string): void {
  getMarketplaceDb().prepare("UPDATE developers SET totp_enabled = 0, totp_secret = NULL, updated_at = ? WHERE id = ?").run(new Date().toISOString(), userId);
  audit("auth.mfa_disabled", "user", userId, userId);
}

export type UserSession = { id: string; createdAt: string | null; lastSeenAt: string | null; userAgent: string | null; current: boolean };

export async function listUserSessions(userId: string): Promise<UserSession[]> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const currentHash = token ? sha256(token) : "";
  const rows = getMarketplaceDb().prepare("SELECT token, token_hash, created_at, last_seen_at, user_agent FROM sessions WHERE developer_id = ? AND expires_at > ? ORDER BY last_seen_at DESC").all(userId, Date.now()) as Array<{ token: string; token_hash: string | null; created_at: string | null; last_seen_at: string | null; user_agent: string | null }>;
  return rows.map((row) => ({ id: row.token, createdAt: row.created_at, lastSeenAt: row.last_seen_at, userAgent: row.user_agent, current: row.token_hash === currentHash }));
}

export function revokeUserSession(userId: string, sessionId: string): boolean {
  return getMarketplaceDb().prepare("DELETE FROM sessions WHERE token = ? AND developer_id = ?").run(sessionId, userId).changes > 0;
}
