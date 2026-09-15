import { revalidatePath } from "next/cache";
import { assertSameOrigin, audit } from "@/lib/auth/security";
import { getCurrentUser, isAdmin } from "@/lib/marketplace/auth";
import { getMarketplaceDb } from "@/lib/marketplace/db";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const admin = await getCurrentUser();
  if (!isAdmin(admin)) return Response.json({ error: "需要管理员权限" }, { status: 403 });
  const id = (await params).id;
  const row = getMarketplaceDb().prepare("SELECT account_id FROM observation_comments WHERE id = ?").get(id) as { account_id: string } | undefined;
  if (!row) return Response.json({ error: "评论不存在" }, { status: 404 });
  getMarketplaceDb().prepare("UPDATE observation_comments SET is_hidden = 1, updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  audit("admin.observation_comment_hidden", "observation_comment", id, admin!.id, request, { accountId: row.account_id });
  revalidatePath(`/observation/${row.account_id}`);
  return Response.json({ ok: true });
}