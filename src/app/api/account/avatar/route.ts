import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { assertSameOrigin, audit } from "@/lib/auth/security";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { getMarketplaceDb, getMarketplaceStorageDirectory } from "@/lib/marketplace/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("avatar");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "请选择头像图片" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "头像原图不能超过 5MB" }, { status: 400 });
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) return Response.json({ error: "仅支持 JPG、PNG 或 WebP" }, { status: 400 });
  try {
    const source = Buffer.from(await file.arrayBuffer());
    const image = sharp(source, { failOn: "warning" }).rotate();
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096) return Response.json({ error: "头像尺寸无效或超过 4096 像素" }, { status: 400 });
    const output = await image.resize(512, 512, { fit: "cover" }).webp({ quality: 86 }).toBuffer();
    const directory = join(getMarketplaceStorageDirectory(), "avatars");
    const filename = `${user.id}.webp`;
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, filename), output);
    getMarketplaceDb().prepare("UPDATE developers SET avatar_filename = ?, updated_at = ? WHERE id = ?").run(filename, new Date().toISOString(), user.id);
    audit("account.avatar_updated", "user", user.id, user.id, request);
    return Response.json({ avatarUrl: `/api/users/${user.id}/avatar?v=${Date.now()}` });
  } catch {
    return Response.json({ error: "无法处理该图片，请更换后重试" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const row = getMarketplaceDb().prepare("SELECT avatar_filename FROM developers WHERE id = ?").get(user.id) as { avatar_filename: string | null } | undefined;
  if (row?.avatar_filename) {
    try { unlinkSync(join(getMarketplaceStorageDirectory(), "avatars", row.avatar_filename)); } catch { /* 文件可能已不存在 */ }
  }
  getMarketplaceDb().prepare("UPDATE developers SET avatar_filename = NULL, updated_at = ? WHERE id = ?").run(new Date().toISOString(), user.id);
  audit("account.avatar_deleted", "user", user.id, user.id, request);
  return Response.json({ ok: true });
}
