import { z } from "zod";
import { assertSameOrigin, clientIp, consumeRateLimit } from "@/lib/auth/security";
import { completeMfaChallenge } from "@/lib/marketplace/auth";

export const runtime = "nodejs";
const schema = z.object({ code: z.string().regex(/^\d{6}$/) });

export async function POST(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const rate = consumeRateLimit("mfa-login", clientIp(request), 10, 15 * 60 * 1000);
  if (rate.limited) return Response.json({ error: "验证尝试过于频繁" }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !(await completeMfaChallenge(parsed.data.code, request))) return Response.json({ error: "验证码不正确或已过期" }, { status: 401 });
  return Response.json({ ok: true });
}
