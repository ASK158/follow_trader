import { z } from "zod";
import { assertSameOrigin, audit, clientIp, consumeRateLimit } from "@/lib/auth/security";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { InsufficientGaBalanceError, purchaseWithGa } from "@/lib/marketplace/orders";
import { getCatalogProduct } from "@/lib/marketplace/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const orderSchema = z.object({
  productId: z.string().min(1).max(100),
});

export async function POST(request: Request) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录后购买" }, { status: 401 });
  if (!user.emailVerified) return Response.json({ error: "请先验证邮箱" }, { status: 403 });
  const rate = consumeRateLimit("orders", `${clientIp(request)}:${user.id}`, 10, 60 * 60 * 1000);
  if (rate.limited) return Response.json({ error: "下单过于频繁，请稍后重试" }, { status: 429 });
  const parsed = orderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不正确" }, { status: 400 });
  }
  const product = getCatalogProduct(parsed.data.productId);
  if (!product) {
    return Response.json({ error: "商品不存在或已下架" }, { status: 404 });
  }
  try {
    const { order, downloadToken, balance } = purchaseWithGa(product.id, product.name, user.email, product.price, user.id);
    audit("order.created", "order", order.id, user.id, request, { productId: product.id, amount: product.price, currency: "GA", balance });
    return Response.json({
      order: { id: order.id, productId: order.productId, amount: order.amount, currency: order.currency, createdAt: order.createdAt },
      balance,
      downloadUrl: `/api/marketplace/download/${order.id}?token=${downloadToken}`,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof InsufficientGaBalanceError) {
      return Response.json({ error: `Gas 余额不足，当前 ${error.balance} Gas，需要 ${error.required} Gas`, balance: error.balance, required: error.required }, { status: 402 });
    }
    console.error("[orders POST] Gas 订单创建失败:", error);
    return Response.json({ error: "订单创建失败，请稍后重试" }, { status: 500 });
  }
}
