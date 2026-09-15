import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductComments } from "@/components/product-comments";
import { PurchasePanel } from "@/components/purchase-panel";
import { SiteNav } from "@/components/site-nav";
import { getCurrentDeveloper, isAdmin } from "@/lib/marketplace/auth";
import { listProductComments } from "@/lib/marketplace/comments";
import { getCatalogProduct, incrementProductViews } from "@/lib/marketplace/products";
import { sanitizeProductDescription } from "@/lib/marketplace/rich-text";

type Props = { params: Promise<{ productId: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = getCatalogProduct((await params).productId);
  return product ? { title: `${product.name} | EA / 指标商城`, description: product.tagline } : {};
}

export default async function ProductDetailPage({ params }: Props) {
  const productId = (await params).productId;
  if (!getCatalogProduct(productId)) notFound();
  incrementProductViews(productId);
  const product = getCatalogProduct(productId)!;
  const [currentUser, comments] = await Promise.all([getCurrentDeveloper(), Promise.resolve(listProductComments(productId))]);
  const descriptionHtml = product.origin === "community" ? sanitizeProductDescription(product.description) : "";
  return (
    <main className="platform-shell product-shell">
      <SiteNav active="marketplace" />
      <div className="platform-breadcrumb"><Link href="/marketplace">← 返回交易工具市场</Link><span>{product.category} / {product.platform}</span></div>
      <header className="product-detail-header">
        <div className="product-cover product-cover-large" style={{ "--product-accent": product.accent } as React.CSSProperties}><span>{product.type}</span><b>{product.name}</b><small>{product.platform} · {product.origin === "community" && product.isTemplate ? "TEMPLATE GUIDE" : "SOURCE INCLUDED"}</small><i>Σ</i></div>
        <div className="product-intro"><span className="panel-code">{product.type} / {product.category} / V{product.version}{product.origin === "community" ? " / 社区作品" : " / 官方演示"}</span><h1>{product.name}</h1><p>{product.tagline}</p><div className="product-meta"><span>{product.views} 次浏览</span><span>{product.favorites} 次收藏</span><span>更新于 {product.updatedAt}</span></div>{product.origin === "community" ? <div className="product-description rte-content" dangerouslySetInnerHTML={{ __html: descriptionHtml }} /> : <p className="product-description">{product.description}</p>}<small>开发者：{product.developer}</small></div>
      </header>
      <div className="product-detail-grid">
        <div className="product-content">
          {product.gallery.length > 0 && <section><span className="panel-code">PRODUCT PREVIEW</span><h2>界面与功能预览</h2><div className="product-gallery">{product.gallery.map((image, index) => <figure key={image.title} className={`product-shot ${image.variant}`}><div><span>0{index + 1}</span><b>{image.title}</b><i /></div><figcaption>{image.caption}</figcaption></figure>)}</div></section>}
          {product.features.length > 0 && <section><span className="panel-code">FEATURE MATRIX</span><h2>核心功能</h2><div className="feature-list">{product.features.map((feature, index) => <div key={feature}><span>{String(index + 1).padStart(2, "0")}</span><b>{feature}</b></div>)}</div></section>}
          <section><span className="panel-code">ENVIRONMENT</span><h2>运行要求与说明</h2><ul className="requirement-list">{product.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul></section>
        </div>
        <PurchasePanel productId={product.id} productName={product.name} price={product.price} filename={product.sourceFilename} isTemplate={product.origin === "community" && product.isTemplate} currentUserEmail={currentUser?.email} currentUserBalance={currentUser?.gaBalance} />
      </div>
      <ProductComments productId={product.id} comments={comments} currentUser={currentUser ? { id: currentUser.id, name: currentUser.name } : null} isAdmin={isAdmin(currentUser)} />
      <footer className="platform-footer">自动交易具有风险。购买和下载源码不代表任何收益承诺，请先完成编译、代码审查、回测和模拟账户验证。</footer>
    </main>
  );
}
