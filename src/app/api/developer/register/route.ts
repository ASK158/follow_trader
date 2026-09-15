import { z } from "zod";
import { queueAccountEmail } from "@/lib/auth/email";
import { assessRegistrationRisk, recordRegistrationRisk } from "@/lib/auth/registration-risk";
import { audit, assertSameOrigin, clientIp, consumeRateLimit } from "@/lib/auth/security";
import { issueAccountToken, registerUser } from "@/lib/marketplace/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const registerSchema = z.object({
  email: z.string().email("邮箱格式不正确").max(200),
  password: z.string().min(10, "密码至少 10 位").max(100).regex(/[A-Za-z]/, "密码必须包含字母").regex(/\d/, "密码必须包含数字"),
  name: z.string().min(2, "开发者名称至少 2 个字符").max(50),
  deviceId: z.string().uuid("设备标识无效"),
});

export async function POST(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  if (process.env.NODE_ENV === "production" && process.env.PUBLIC_REGISTRATION_ENABLED !== "true") {
    return Response.json({ error: "公测期间暂不开放自助注册" }, { status: 403 });
  }
  const rate = consumeRateLimit("register", clientIp(request), 5, 60 * 60 * 1000);
  if (rate.limited) return Response.json({ error: "注册请求过于频繁，请稍后重试" }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不正确" }, { status: 400 });
  }
  const { email, password, name } = parsed.data;
  const risk = assessRegistrationRisk(request, email.toLowerCase(), parsed.data.deviceId);
  if (!risk.allowed) {
    audit("auth.registration_blocked", "registration", null, null, request, { flags: risk.flags, score: risk.score });
    return Response.json({ error: risk.reason ?? "注册请求未通过安全检查" }, { status: 429, headers: { "Retry-After": String(risk.retryAfter ?? 3600) } });
  }
  const result = await registerUser(email.toLowerCase(), password, name.trim());
  if (!result.user) {
    return Response.json({ error: result.error }, { status: 409 });
  }
  const recordedRisk = recordRegistrationRisk(result.user.id, risk);
  if (!recordedRisk.recorded) {
    audit("auth.registration_blocked", "registration", null, null, request, { flags: ["concurrent_limit"], score: 100 });
    return Response.json({ error: recordedRisk.reason ?? "注册请求未通过安全检查" }, { status: 429 });
  }
  const token = issueAccountToken(result.user.id, "verify_email", 24 * 60 * 60 * 1000);
  const verificationUrl = `${new URL(request.url).origin}/account/verify-email?token=${encodeURIComponent(token)}`;
  await queueAccountEmail(result.user.email, "verify_email", verificationUrl);
  audit("auth.register", "user", result.user.id, result.user.id, request, { freeEligible: risk.freeEligible, riskScore: risk.score, riskFlags: risk.flags });
  return Response.json({ verificationRequired: true, ...(process.env.NODE_ENV !== "production" ? { verificationUrl } : {}) }, { status: 201 });
}
