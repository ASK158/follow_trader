import { getDemoSource, getMarketplaceProduct } from "@/lib/marketplace-data";

export async function GET(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const product = getMarketplaceProduct((await params).productId);
  const confirmed = new URL(request.url).searchParams.get("confirmed") === "1";
  if (!product) return Response.json({ error: "商品不存在" }, { status: 404 });
  if (!confirmed) return Response.json({ error: "演示订单尚未确认" }, { status: 403 });
  return new Response(getDemoSource(product), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${product.sourceFilename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
