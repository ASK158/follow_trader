import { z } from "zod";
import { assertSameOrigin, audit } from "@/lib/auth/security";
import { getCurrentDeveloper, isAdmin } from "@/lib/marketplace/auth";
import { getProductById, reviewProduct } from "@/lib/marketplace/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reviewSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().max(500).optional(),
});

type Props = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Props) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const developer = await getCurrentDeveloper();
  if (!isAdmin(developer)) {
    return Response.json({ error: "需要管理员权限" }, { status: 403 });
  }
  const product = getProductById((await params).id);
  if (!product) {
    return Response.json({ error: "商品不存在" }, { status: 404 });
  }
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "参数不正确" }, { status: 400 });
  }
  if (parsed.data.decision === "rejected" && !parsed.data.note?.trim()) {
    return Response.json({ error: "驳回时必须填写原因" }, { status: 400 });
  }
  reviewProduct(product.id, parsed.data.decision, parsed.data.note?.trim() || null);
  audit("admin.product_reviewed", "product", product.id, developer!.id, request, { decision: parsed.data.decision, note: parsed.data.note?.trim() || null });
  return Response.json({ ok: true });
}
