import { assertSameOrigin } from "@/lib/auth/security";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { getMarketplaceDb } from "@/lib/marketplace/db";

export const runtime = "nodejs";
const MAX_DRAFT_BYTES = 1_000_000;

export async function GET() {
  const user = await getCurrentUser(); if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const rows = getMarketplaceDb().prepare("SELECT payload FROM agent_drafts WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20").all(user.id) as Array<{ payload: string }>;
  return Response.json({ drafts: rows.flatMap((row) => { try { return [JSON.parse(row.payload)]; } catch { return []; } }) });
}

export async function PUT(request: Request) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser(); if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const text = await request.text(); if (Buffer.byteLength(text, "utf8") > MAX_DRAFT_BYTES) return Response.json({ error: "草稿过大" }, { status: 413 });
  let draft: { id?: unknown; title?: unknown; updatedAt?: unknown }; try { draft = JSON.parse(text); } catch { return Response.json({ error: "草稿格式不正确" }, { status: 400 }); }
  if (typeof draft.id !== "string" || !draft.id || draft.id.length > 100 || typeof draft.title !== "string" || !draft.title || draft.title.length > 100) return Response.json({ error: "草稿参数不正确" }, { status: 400 });
  const now = new Date().toISOString();
  getMarketplaceDb().prepare(`
    INSERT INTO agent_drafts (id, user_id, title, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id, user_id) DO UPDATE SET title = excluded.title, payload = excluded.payload, updated_at = excluded.updated_at
  `).run(draft.id, user.id, draft.title, text, now, now);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser(); if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id"); if (!id) return Response.json({ error: "缺少草稿 ID" }, { status: 400 });
  getMarketplaceDb().prepare("DELETE FROM agent_drafts WHERE id = ? AND user_id = ?").run(id, user.id);
  return Response.json({ ok: true });
}
