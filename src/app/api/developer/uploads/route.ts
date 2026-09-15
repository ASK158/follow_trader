import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertSameOrigin } from "@/lib/auth/security";
import { getCurrentDeveloper } from "@/lib/marketplace/auth";
import { getMarketplaceStorageDirectory } from "@/lib/marketplace/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

/** 富文本编辑器插图上传：仅登录开发者，返回可公开访问的图片 URL */
export async function POST(request: Request) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const developer = await getCurrentDeveloper();
  if (!developer) {
    return Response.json({ error: "请先登录开发者账户" }, { status: 401 });
  }
  if (!developer.emailVerified) return Response.json({ error: "请先验证邮箱" }, { status: 403 });
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "请选择图片文件" }, { status: 400 });
  }
  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    return Response.json({ error: "仅支持 PNG / JPG / GIF / WebP 图片" }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return Response.json({ error: "图片不能超过 5MB" }, { status: 400 });
  }
  const filename = `${Date.now()}-${randomBytes(6).toString("hex")}${extension}`;
  const directory = join(getMarketplaceStorageDirectory(), "images");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, filename), Buffer.from(await file.arrayBuffer()));
  return Response.json({ url: `/api/marketplace/images/${filename}` }, { status: 201 });
}
