import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ReviewPanel } from "@/components/review-panel";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { getCurrentDeveloper, isAdmin } from "@/lib/marketplace/auth";
import { formatGa } from "@/lib/marketplace/currency";
import { listProductsByStatus } from "@/lib/marketplace/products";
import { sanitizeProductDescription } from "@/lib/marketplace/rich-text";

export const metadata: Metadata = { title: "上架审核 | Sigma Bot" };

export const dynamic = "force-dynamic";

export default async function AdminReviewPage() {
  const developer = await getCurrentDeveloper();
  if (!developer) redirect("/developer/login");
  if (!isAdmin(developer)) redirect("/developer");
  const pending = listProductsByStatus("pending");
  return (
    <main className="platform-shell developer-shell">
      <SiteNav active="developer" />
      <div className="platform-breadcrumb"><Link href="/developer">← 返回个人中心</Link><span>REVIEW QUEUE · {pending.length}</span></div>
      <header className="dev-form-header"><span className="panel-code">ADMIN REVIEW</span><h1>上架审核队列</h1><p>审核开发者提交的作品。通过后自动上架商城；驳回需填写原因，开发者可修改后重新提交。</p></header>
      <section className="dev-product-list" aria-label="待审核作品">
        {pending.length === 0 ? (
          <div className="dev-empty"><b>队列为空</b><p>当前没有待审核的作品。</p></div>
        ) : pending.map((product) => (
          <article key={product.id} className="dev-product-row dev-review-row">
            <div className="product-cover dev-product-cover" style={{ "--product-accent": product.accent } as React.CSSProperties}><span>{product.type}</span><b>{product.name}</b><i>Σ</i></div>
            <div className="dev-product-info">
              <div><b>{product.name}</b><span className="dev-status status-pending">审核中</span></div>
              <p>{product.tagline}</p>
              <small>{product.category} · {product.platform} · v{product.version} · {formatGa(product.price)} · {product.isTemplate ? "策略模板（无源码文件）" : `源码 ${product.sourceFilename}`} · 提交于 {product.createdAt.slice(0, 10)}</small>
              <details><summary>查看完整描述与要求</summary>
                <div className="rte-content" dangerouslySetInnerHTML={{ __html: sanitizeProductDescription(product.description) }} />
                <ul>{product.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul>
              </details>
            </div>
            <ReviewPanel productId={product.id} />
          </article>
        ))}
      </section>
      <SiteFooter notice="审核仅校验商品信息完整性与合规性；源码质量需下载后人工编译验证。" />
    </main>
  );
}
