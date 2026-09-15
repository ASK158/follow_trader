import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSameOrigin, audit, clientIp, consumeRateLimit } from "@/lib/auth/security";
import { getCurrentDeveloper } from "@/lib/marketplace/auth";
import { createProductComment } from "@/lib/marketplace/comments";
import { getCatalogProduct } from "@/lib/marketplace/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const commentSchema = z.object({
  content: z.string().trim().min(2, "评论至少需要 2 个字符").max(1000, "评论不能超过 1000 个字符"),
});

type Props = { params: Promise<{ productId: string }> };

export async function POST(request: Request, { params }: Props) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const user = await getCurrentDeveloper();
  if (!user) return Response.json({ error: "请先登录后发表评论" }, { status: 401 });
  if (!user.emailVerified) return Response.json({ error: "请先验证邮箱" }, { status: 403 });
  const rate = consumeRateLimit("comments", `${clientIp(request)}:${user.id}`, 10, 10 * 60 * 1000);
  if (rate.limited) return Response.json({ error: "评论发布过于频繁，请稍后重试" }, { status: 429 });
  const productId = (await params).productId;
  if (!getCatalogProduct(productId)) return Response.json({ error: "商品不存在" }, { status: 404 });
  const parsed = commentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "评论内容不正确" }, { status: 400 });
  }
  const comment = createProductComment(productId, user.id, parsed.data.content);
  audit("comment.created", "comment", comment.id, user.id, request, { productId });
  revalidatePath(`/marketplace/${productId}`);
  return Response.json({ comment }, { status: 201 });
}