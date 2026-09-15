import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { assertSameOrigin } from "@/lib/auth/security";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { getMarketplaceDb } from "@/lib/marketplace/db";
import { getCatalogProduct, setProductFavorite } from "@/lib/marketplace/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VISITOR_COOKIE = "marketplace_visitor";
type Props = { params: Promise<{ productId: string }> };

async function updateFavorite(request: Request, { params }: Props, favorite: boolean) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const productId = (await params).productId;
  const product = getCatalogProduct(productId);
  if (!product) return Response.json({ error: "商品不存在" }, { status: 404 });

  const cookieStore = await cookies();
  const user = await getCurrentUser();
  let visitorId = user ? `user:${user.id}` : cookieStore.get(VISITOR_COOKIE)?.value;
  if (!visitorId && favorite) visitorId = randomBytes(18).toString("hex");
  if (!visitorId) return Response.json({ favorite: false, count: product.favorites });

  setProductFavorite(visitorId, productId, favorite);
  if (user && favorite) getMarketplaceDb().prepare("UPDATE product_favorites SET user_id = ? WHERE visitor_id = ? AND product_id = ?").run(user.id, visitorId, productId);
  const response = Response.json({ favorite, count: getCatalogProduct(productId)?.favorites ?? product.favorites });
  if (!user && favorite && !cookieStore.has(VISITOR_COOKIE)) {
    response.headers.append("Set-Cookie", `${VISITOR_COOKIE}=${visitorId}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`);
  }
  return response;
}

export function PUT(request: Request, props: Props) {
  return updateFavorite(request, props, true);
}

export function DELETE(request: Request, props: Props) {
  return updateFavorite(request, props, false);
}
