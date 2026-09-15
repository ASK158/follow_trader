import { createHash } from "node:crypto";
import { clientIp, clientIpHash } from "@/lib/auth/security";
import { getMarketplaceDb } from "@/lib/marketplace/db";
import { getPlatformSettings } from "@/lib/platform-settings";

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "10minutemail.com", "guerrillamail.com", "mailinator.com", "temp-mail.org", "tempmail.com", "yopmail.com",
]);

type RegistrationRiskAssessment = {
  allowed: boolean;
  freeEligible: boolean;
  score: number;
  flags: string[];
  ipHash: string;
  deviceHash: string;
  emailDomain: string;
  retryAfter?: number;
  reason?: string;
};

function hashDevice(deviceId: string): string {
  return createHash("sha256").update(`${process.env.AUTH_DEVICE_PEPPER ?? process.env.AUTH_AUDIT_PEPPER ?? "sigma-local"}:${deviceId}`).digest("hex");
}

export function assessRegistrationRisk(request: Request, email: string, deviceId: string): RegistrationRiskAssessment {
  const db = getMarketplaceDb();
  const settings = getPlatformSettings();
  const ipHash = clientIpHash(request);
  const deviceHash = hashDevice(deviceId);
  const emailDomain = email.split("@")[1]?.toLowerCase() ?? "unknown";
  const now = Date.now();
  const dayCutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const deviceCutoff = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const ipRegistrations = (db.prepare("SELECT COUNT(*) AS count FROM registration_signals WHERE ip_hash = ? AND created_at >= ?").get(ipHash, dayCutoff) as { count: number }).count;
  const deviceRegistrations = (db.prepare("SELECT COUNT(*) AS count FROM registration_signals WHERE device_hash = ? AND created_at >= ?").get(deviceHash, deviceCutoff) as { count: number }).count;
  if (ipRegistrations >= Math.trunc(settings.registrationIpDailyLimit)) {
    return { allowed: false, freeEligible: false, score: 100, flags: ["ip_daily_limit"], ipHash, deviceHash, emailDomain, retryAfter: 86_400, reason: "当前网络今日注册账户过多，请稍后再试" };
  }
  if (deviceRegistrations >= Math.trunc(settings.registrationDevice30dLimit)) {
    return { allowed: false, freeEligible: false, score: 100, flags: ["device_30d_limit"], ipHash, deviceHash, emailDomain, retryAfter: 2_592_000, reason: "当前设备近期注册账户过多" };
  }
  const flags: string[] = [];
  let score = 0;
  if (DISPOSABLE_EMAIL_DOMAINS.has(emailDomain)) { flags.push("disposable_email"); score += 70; }
  if (clientIp(request) === "unknown") { flags.push("unknown_ip"); score += 30; }
  if (ipRegistrations > 0) { flags.push("shared_ip"); score += ipRegistrations * 15; }
  if (deviceRegistrations > 0) { flags.push("reused_device"); score += deviceRegistrations * 35; }
  return { allowed: true, freeEligible: score < settings.registrationRiskThreshold, score, flags, ipHash, deviceHash, emailDomain };
}

export function recordRegistrationRisk(userId: string, assessment: RegistrationRiskAssessment): { recorded: boolean; reason?: string } {
  const db = getMarketplaceDb();
  const now = new Date().toISOString();
  return db.transaction(() => {
    const settings = getPlatformSettings();
    const dayCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const deviceCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const ipCount = (db.prepare("SELECT COUNT(*) AS count FROM registration_signals WHERE ip_hash = ? AND created_at >= ?").get(assessment.ipHash, dayCutoff) as { count: number }).count;
    const deviceCount = (db.prepare("SELECT COUNT(*) AS count FROM registration_signals WHERE device_hash = ? AND created_at >= ?").get(assessment.deviceHash, deviceCutoff) as { count: number }).count;
    if (ipCount >= Math.trunc(settings.registrationIpDailyLimit) || deviceCount >= Math.trunc(settings.registrationDevice30dLimit)) {
      db.prepare("DELETE FROM developers WHERE id = ?").run(userId);
      return { recorded: false, reason: ipCount >= Math.trunc(settings.registrationIpDailyLimit) ? "当前网络今日注册账户过多，请稍后再试" : "当前设备近期注册账户过多" };
    }
    db.prepare(`
      INSERT INTO registration_signals (user_id, ip_hash, device_hash, email_domain, risk_score, risk_flags, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, assessment.ipHash, assessment.deviceHash, assessment.emailDomain, assessment.score, JSON.stringify(assessment.flags), now);
    db.prepare(`
      UPDATE developers SET agent_free_eligible = ?, registration_risk_score = ?, registration_risk_flags = ?, updated_at = ?
      WHERE id = ?
    `).run(assessment.freeEligible ? 1 : 0, assessment.score, JSON.stringify(assessment.flags), now, userId);
    return { recorded: true };
  })();
}
