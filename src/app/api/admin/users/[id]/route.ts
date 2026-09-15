import { z } from "zod";
import { assertSameOrigin, audit } from "@/lib/auth/security";
import { updateUserAccess } from "@/lib/auth/admin";
import { getCurrentUser, isAdmin } from "@/lib/marketplace/auth";

const schema = z.object({ role: z.enum(["user", "admin"]), status: z.enum(["active", "suspended"]) });
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const actor = await getCurrentUser(); if (!isAdmin(actor)) return Response.json({ error: "需要管理员权限" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "参数不正确" }, { status: 400 });
  const targetId = (await params).id;
  const result = updateUserAccess(actor!.id, targetId, parsed.data.role, parsed.data.status);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  audit("admin.user_access_updated", "user", targetId, actor!.id, request, parsed.data);
  return Response.json({ ok: true });
}
