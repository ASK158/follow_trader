import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ProductSubmitForm } from "@/components/product-submit-form";
import { SiteNav } from "@/components/site-nav";
import { getCurrentDeveloper } from "@/lib/marketplace/auth";

export const metadata: Metadata = { title: "提交新作品 | 个人中心", description: "上传 EA / 指标源码，或提交无需策略文件的模板策略，审核后上架商城。" };

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const developer = await getCurrentDeveloper();
  if (!developer) redirect("/developer/login");
  return (
    <main className="platform-shell developer-shell">
      <SiteNav active="developer" />
      <div className="platform-breadcrumb"><Link href="/developer">← 返回个人中心</Link><span>NEW PRODUCT</span></div>
      <header className="dev-form-header"><span className="panel-code">SUBMIT PRODUCT</span><h1>提交新作品</h1><p>可上传源码文件，或以策略模板形式仅交付说明与配置框架。提交后进入审核队列，审核通过即自动上架商城。</p></header>
      <section className="dev-form-section"><ProductSubmitForm mode="create" /></section>
    </main>
  );
}
