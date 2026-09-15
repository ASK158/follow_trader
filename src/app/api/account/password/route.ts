import { z } from "zod";
import { assertSameOrigin } from "@/lib/auth/security";
import { changePassword, getCurrentUser } from "@/lib/marketplace/auth";

const schema = z.object({ currentPassword: z.string().min(1).max(100), newPassword: z.string().min(10).max(100).regex(/[A-Za-z]/).regex(/\d/) });
export async function POST(request: Request) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser(); if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "新密码至少 10 位，且必须包含字母和数字" }, { status: 400 });
  if (!(await changePassword(user.id, parsed.data.currentPassword, parsed.data.newPassword))) return Response.json({ error: "当前密码不正确" }, { status: 400 });
  return Response.json({ ok: true });
}
