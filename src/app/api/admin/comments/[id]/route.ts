import { z } from "zod";
import { assertSameOrigin, audit } from "@/lib/auth/security";
import { getCurrentUser, isAdmin } from "@/lib/marketplace/auth";
import { getMarketplaceDb } from "@/lib/marketplace/db";

const schema = z.object({ hidden: z.boolean(), note: z.string().trim().max(300).optional() });
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const admin = await getCurrentUser(); if (!isAdmin(admin)) return Response.json({ error: "需要管理员权限" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "参数不正确" }, { status: 400 });
  const id = (await params).id;
  const changed = getMarketplaceDb().prepare("UPDATE product_comments SET is_hidden = ?, moderation_note = ?, updated_at = ? WHERE id = ?").run(parsed.data.hidden ? 1 : 0, parsed.data.note ?? null, new Date().toISOString(), id).changes;
  if (!changed) return Response.json({ error: "评论不存在" }, { status: 404 });
  audit("admin.comment_moderated", "comment", id, admin!.id, request, parsed.data);
  return Response.json({ ok: true });
}
