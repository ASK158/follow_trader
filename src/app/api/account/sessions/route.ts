import { z } from "zod";
import { assertSameOrigin, audit } from "@/lib/auth/security";
import { getCurrentUser, listUserSessions, revokeUserSession } from "@/lib/marketplace/auth";

const schema = z.object({ sessionId: z.string().min(1).max(100) });
export async function GET() {
  const user = await getCurrentUser(); if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  return Response.json({ sessions: await listUserSessions(user.id) });
}
export async function DELETE(request: Request) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser(); if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "参数不正确" }, { status: 400 });
  const revoked = revokeUserSession(user.id, parsed.data.sessionId);
  if (revoked) audit("auth.session_revoked", "session", parsed.data.sessionId, user.id, request);
  return Response.json({ ok: revoked });
}
