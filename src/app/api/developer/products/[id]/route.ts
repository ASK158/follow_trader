import { existsSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";
import { assertSameOrigin } from "@/lib/auth/security";
import { getCurrentDeveloper } from "@/lib/marketplace/auth";
import { getMarketplaceStorageDirectory } from "@/lib/marketplace/db";
import { parseProductForm, saveCoverImage, saveSourceFile } from "@/lib/marketplace/product-form";
import { getProductById, updateProduct } from "@/lib/marketplace/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

function deleteCoverImage(url: string | null | undefined) {
  if (!url?.startsWith("/api/marketplace/images/")) return;
  const filename = basename(url);
  if (!/^[\w.-]+$/.test(filename)) return;
  const path = join(getMarketplaceStorageDirectory(), "images", filename);
  if (existsSync(path)) unlinkSync(path);
}

export async function PUT(request: Request, { params }: Props) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const developer = await getCurrentDeveloper();
  if (!developer) {
    return Response.json({ error: "请先登录开发者账户" }, { status: 401 });
  }
  if (!developer.emailVerified) return Response.json({ error: "请先验证邮箱" }, { status: 403 });
  const product = getProductById((await params).id);
  if (!product || product.developerId !== developer.id) {
    return Response.json({ error: "商品不存在或无权限" }, { status: 404 });
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > 17 * 1024 * 1024) {
    return Response.json({ error: "提交内容过大" }, { status: 413 });
  }
  const { data, error } = parseProductForm(await request.formData().catch(() => new FormData()));
  if (!data) {
    return Response.json({ error }, { status: 400 });
  }
  if (!data.sourceFile && !data.input.isTemplate && product.isTemplate) {
    return Response.json({ error: "将模板策略改为源码商品时，请上传策略文件" }, { status: 400 });
  }
  try {
    let source = { filename: product.sourceFilename, path: product.sourcePath };
    if (data.input.isTemplate) {
      if (product.sourcePath && existsSync(product.sourcePath)) unlinkSync(product.sourcePath);
      source = { filename: "策略模板说明.txt", path: "" };
    } else if (data.sourceFile) {
      const saved = await saveSourceFile(product.id, data.sourceFile);
      // rmSync 在 Node v24 + Windows 中文路径下会原生崩溃，改用 unlinkSync
      if (existsSync(product.sourcePath)) unlinkSync(product.sourcePath);
      source = saved;
    }
    let coverImage = product.coverImage ?? null;
    if (data.coverFile) {
      const savedCover = await saveCoverImage(data.coverFile);
      deleteCoverImage(coverImage);
      coverImage = savedCover;
    } else if (data.removeCover) {
      deleteCoverImage(coverImage);
      coverImage = null;
    }
    updateProduct(product.id, developer.id, { ...data.input, coverImage, sourceFilename: source.filename, sourcePath: source.path });
    return Response.json({ product: { id: product.id, status: "pending" } });
  } catch (cause) {
    console.error("[products PUT] 更新失败:", cause);
    return Response.json({ error: `保存失败：${cause instanceof Error ? cause.message : "未知错误"}` }, { status: 500 });
  }
}
