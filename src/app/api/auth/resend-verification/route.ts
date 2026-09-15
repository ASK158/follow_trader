import { z } from "zod";
import { queueAccountEmail } from "@/lib/auth/email";
import { assertSameOrigin, clientIp, consumeRateLimit } from "@/lib/auth/security";
import { findUserByEmail, issueAccountToken } from "@/lib/marketplace/auth";

const schema = z.object({ email: z.string().email().max(200) });
export async function POST(request: Request) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const rate = consumeRateLimit("verify-email", clientIp(request), 5, 60 * 60 * 1000);
  if (rate.limited) return Response.json({ ok: true });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "请输入有效邮箱" }, { status: 400 });
  const user = findUserByEmail(parsed.data.email.toLowerCase()); let verificationUrl: string | undefined;
  if (user && !user.emailVerified && user.status === "active") {
    const token = issueAccountToken(user.id, "verify_email", 24 * 60 * 60 * 1000);
    verificationUrl = `${new URL(request.url).origin}/account/verify-email?token=${encodeURIComponent(token)}`;
    await queueAccountEmail(user.email, "verify_email", verificationUrl);
  }
  return Response.json({ ok: true, message: "如果邮箱尚未验证，新的验证链接将发送到邮箱。", ...(process.env.NODE_ENV !== "production" && verificationUrl ? { verificationUrl } : {}) });
}
