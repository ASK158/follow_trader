import { z } from "zod";
import { assertSameOrigin, audit } from "@/lib/auth/security";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { getMarketplaceDb } from "@/lib/marketplace/db";

const schema = z.object({ name: z.string().trim().min(2).max(50) });
export async function PATCH(request: Request) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser(); if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "名称需要 2 至 50 个字符" }, { status: 400 });
  getMarketplaceDb().prepare("UPDATE developers SET name = ?, updated_at = ? WHERE id = ?").run(parsed.data.name, new Date().toISOString(), user.id);
  audit("account.profile_updated", "user", user.id, user.id, request);
  return Response.json({ ok: true });
}
