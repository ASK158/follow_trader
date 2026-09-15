import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { getDemoSource, getMarketplaceProduct } from "@/lib/marketplace-data";
import { verifyDownloadToken } from "@/lib/marketplace/orders";
import { getProductById } from "@/lib/marketplace/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ orderId: string }> };

function getTemplateGuide(product: { name: string; platform: string; version: string; tagline: string; requirements: string[] }): string {
  return `${product.name} — 策略模板说明\n\n版本：${product.version}\n适用平台：${product.platform}\n\n策略概览\n${product.tagline}\n\n运行与研究要求\n${product.requirements.map((requirement) => `- ${requirement}`).join("\n")}\n\n交付声明\n本商品为策略模板，仅提供商品页所述的策略逻辑、配置框架与风险提示，不包含 EA、指标、源码或可执行文件。请先进行独立研究、回测和模拟账户验证；本说明不构成收益承诺或投资建议。\n`;
}

export async function GET(request: Request, { params }: Props) {
  const orderId = (await params).orderId;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const order = verifyDownloadToken(orderId, token);
  if (!order) {
    return Response.json({ error: "下载凭证无效或订单不存在" }, { status: 403 });
  }
  // 社区商品：返回开发者上传的真实源码
  const community = getProductById(order.productId);
  if (community) {
    if (community.isTemplate) {
      return new Response(getTemplateGuide(community), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(community.sourceFilename)}`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    if (!existsSync(community.sourcePath)) {
      return Response.json({ error: "源码文件缺失，请联系客服" }, { status: 410 });
    }
    const stream = Readable.toWeb(createReadStream(community.sourcePath)) as ReadableStream;
    return new Response(stream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(statSync(community.sourcePath).size),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(community.sourceFilename)}`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  // 官方演示商品：返回演示源码
  const official = getMarketplaceProduct(order.productId);
  if (!official) {
    return Response.json({ error: "商品不存在" }, { status: 404 });
  }
  return new Response(getDemoSource(official), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${official.sourceFilename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
