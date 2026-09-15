import { getCurrentDeveloper } from "@/lib/marketplace/auth";
import { assertSameOrigin } from "@/lib/auth/security";
import { newProductId, parseProductForm, saveCoverImage, saveSourceFile } from "@/lib/marketplace/product-form";
import { createProduct } from "@/lib/marketplace/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const developer = await getCurrentDeveloper();
  if (!developer) {
    return Response.json({ error: "请先登录开发者账户" }, { status: 401 });
  }
  if (!developer.emailVerified) return Response.json({ error: "请先验证邮箱" }, { status: 403 });
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > 17 * 1024 * 1024) {
    return Response.json({ error: "提交内容过大" }, { status: 413 });
  }
  const { data, error } = parseProductForm(await request.formData().catch(() => new FormData()));
  if (!data) {
    return Response.json({ error }, { status: 400 });
  }
  if (!data.sourceFile && !data.input.isTemplate) {
    return Response.json({ error: "请上传 EA、指标或工具文件（.mq5 / .mq4 / .ex5 / .ex4）" }, { status: 400 });
  }
  const productId = newProductId();
  const source = data.sourceFile ? await saveSourceFile(productId, data.sourceFile) : { filename: "策略模板说明.txt", path: "" };
  const coverImage = data.coverFile ? await saveCoverImage(data.coverFile) : null;
  const product = createProduct(developer.id, { ...data.input, coverImage, sourceFilename: source.filename, sourcePath: source.path }, productId);
  return Response.json({ product: { id: product.id, status: product.status } }, { status: 201 });
}
