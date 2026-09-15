import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProductSubmitForm } from "@/components/product-submit-form";
import { SiteNav } from "@/components/site-nav";
import { getCurrentDeveloper } from "@/lib/marketplace/auth";
import { getProductById } from "@/lib/marketplace/products";

export const metadata: Metadata = { title: "编辑作品 | 个人中心" };

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditProductPage({ params }: Props) {
  const developer = await getCurrentDeveloper();
  if (!developer) redirect("/developer/login");
  const product = getProductById((await params).id);
  if (!product || product.developerId !== developer.id) notFound();
  return (
    <main className="platform-shell developer-shell">
      <SiteNav active="developer" />
      <div className="platform-breadcrumb"><Link href="/developer">← 返回个人中心</Link><span>EDIT / {product.id}</span></div>
      <header className="dev-form-header"><span className="panel-code">EDIT PRODUCT</span><h1>编辑 {product.name}</h1><p>保存后作品将重新进入审核队列，审核通过前商城页面保持当前版本。</p></header>
      <section className="dev-form-section">
        <ProductSubmitForm
          mode="edit"
          productId={product.id}
          initial={{
            name: product.name, type: product.type, platform: product.platform, category: product.category,
            tagline: product.tagline, description: product.description, price: product.price, version: product.version,
            accent: product.accent, coverImage: product.coverImage, requirements: product.requirements,
            sourceFilename: product.sourceFilename,
            isTemplate: product.isTemplate,
          }}
        />
      </section>
    </main>
  );
}
