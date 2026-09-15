import { z } from "zod";
import { queueAccountEmail } from "@/lib/auth/email";
import { assertSameOrigin, clientIp, consumeRateLimit } from "@/lib/auth/security";
import { findUserByEmail, issueAccountToken } from "@/lib/marketplace/auth";

export const runtime = "nodejs";
const schema = z.object({ email: z.string().email().max(200) });

export async function POST(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const rate = consumeRateLimit("forgot-password", clientIp(request), 5, 60 * 60 * 1000);
  if (rate.limited) return Response.json({ ok: true });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "请输入有效邮箱" }, { status: 400 });
  const user = findUserByEmail(parsed.data.email.toLowerCase());
  let resetUrl: string | undefined;
  if (user?.status === "active") {
    const token = issueAccountToken(user.id, "reset_password", 30 * 60 * 1000);
    resetUrl = `${new URL(request.url).origin}/account/reset-password?token=${encodeURIComponent(token)}`;
    await queueAccountEmail(user.email, "reset_password", resetUrl);
  }
  return Response.json({ ok: true, message: "如果该邮箱已注册，重置链接将发送到邮箱。", ...(process.env.NODE_ENV !== "production" && resetUrl ? { resetUrl } : {}) });
}
