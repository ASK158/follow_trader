import { z } from "zod";
import { assertSameOrigin, clientIp, consumeRateLimit } from "@/lib/auth/security";
import { resetPasswordWithToken } from "@/lib/marketplace/auth";

export const runtime = "nodejs";
const schema = z.object({ token: z.string().min(32).max(200), password: z.string().min(10).max(100).regex(/[A-Za-z]/).regex(/\d/) });

export async function POST(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const rate = consumeRateLimit("reset-password", clientIp(request), 10, 30 * 60 * 1000);
  if (rate.limited) return Response.json({ error: "尝试过于频繁，请稍后重试" }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "链接或新密码不符合要求" }, { status: 400 });
  if (!(await resetPasswordWithToken(parsed.data.token, parsed.data.password))) return Response.json({ error: "重置链接无效或已过期" }, { status: 400 });
  return Response.json({ ok: true });
}
