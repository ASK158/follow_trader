import { z } from "zod";
import { assertSameOrigin } from "@/lib/auth/security";
import { confirmMfaSetup, createMfaSetup, disableMfa, getCurrentUser } from "@/lib/marketplace/auth";

const schema = z.object({ code: z.string().regex(/^\d{6}$/) });
export async function POST(request: Request) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser(); if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  return Response.json(createMfaSetup(user));
}
export async function PUT(request: Request) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser(); if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !confirmMfaSetup(user.id, parsed.data.code)) return Response.json({ error: "动态验证码不正确" }, { status: 400 });
  return Response.json({ ok: true });
}
export async function DELETE(request: Request) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser(); if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  disableMfa(user.id); return Response.json({ ok: true });
}
