import { z } from "zod";
import { audit, assertSameOrigin, clearRateLimit, clientIp, consumeRateLimit } from "@/lib/auth/security";
import { authenticateUser, beginMfaChallenge, createSession } from "@/lib/marketplace/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(100),
});

export async function POST(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "请输入邮箱和密码" }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase();
  const rateKey = `${clientIp(request)}:${email}`;
  const rate = consumeRateLimit("login", rateKey, 10, 15 * 60 * 1000);
  if (rate.limited) return Response.json({ error: "登录尝试过于频繁，请稍后重试" }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  const user = await authenticateUser(email, parsed.data.password);
  if (!user) {
    audit("auth.login_failed", "user", null, null, request, { emailHash: email.length });
    return Response.json({ error: "邮箱或密码不正确" }, { status: 401 });
  }
  if (user.status !== "active") return Response.json({ error: "账户已被停用，请联系管理员" }, { status: 403 });
  if (!user.emailVerified) return Response.json({ error: "请先完成邮箱验证" }, { status: 403, headers: { "X-Auth-Reason": "email-unverified" } });
  clearRateLimit("login", rateKey);
  if (user.mfaEnabled) {
    await beginMfaChallenge(user.id);
    return Response.json({ mfaRequired: true });
  }
  await createSession(user.id, request);
  audit("auth.login", "user", user.id, user.id, request);
  return Response.json({ user });
}
