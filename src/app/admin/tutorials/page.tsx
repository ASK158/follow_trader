import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { getCurrentUser, isAdmin } from "@/lib/marketplace/auth";
import { listManagedTutorials } from "@/lib/tutorials";

export const metadata: Metadata = { title: "教程管理 | Sigma Bot" };
export const dynamic = "force-dynamic";

export default async function AdminTutorialsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/developer/login?next=/admin/tutorials");
  if (!isAdmin(admin)) redirect("/developer");
  const tutorials = listManagedTutorials();
  const saved = (await searchParams).saved === "1";
  return (
    <main className="platform-shell developer-shell">
      <SiteNav active="developer" />
      <div className="platform-breadcrumb"><Link href="/developer">← 返回个人中心</Link><span>ADMIN / TUTORIALS</span></div>
      <header className="dev-form-header"><span className="panel-code">CONTENT MANAGEMENT</span><h1>教程管理</h1><p>创建图文教程或绑定 YouTube、Bilibili、TikTok 视频。草稿仅管理员可见，发布后立即展示在教程中心。</p></header>
      <div className="tutorial-admin-actions"><Link href="/admin/tutorials/new" className="dev-primary-action">＋ 上传新教程</Link><Link href="/tutorials" className="dev-secondary-action">查看教程中心 →</Link></div>
      {saved && <p className="dev-notice">✓ 教程已保存。</p>}
      <section className="dev-product-list" aria-label="教程列表">
        {tutorials.length ? tutorials.map((tutorial) => (
          <article className="dev-product-row" key={tutorial.id}>
            <div className="tutorial-cover dev-product-cover" style={{ "--tutorial-accent": tutorial.accent } as React.CSSProperties}><span>{tutorial.kind === "video" ? "▶" : "T"}</span><b>{tutorial.platform ?? tutorial.category}</b><i>Σ / LEARN</i></div>
            <div className="dev-product-info">
              <div><b>{tutorial.title}</b><span className={`dev-status ${tutorial.status === "published" ? "status-approved" : "status-pending"}`}>{tutorial.status === "published" ? "已发布" : "草稿"}</span></div>
              <p>{tutorial.summary}</p>
              <small>{tutorial.kind === "article" ? "图文教程" : `${tutorial.platform} 视频`} · {tutorial.category} · {tutorial.level} · {tutorial.duration} · 更新于 {tutorial.updatedAt.slice(0, 10)}</small>
            </div>
            <div className="dev-product-actions"><Link href={`/admin/tutorials/${tutorial.id}`}>编辑</Link>{tutorial.status === "published" && (tutorial.kind === "article" ? <Link href={`/tutorials/${tutorial.id}`}>查看页面 →</Link> : <a href={tutorial.externalUrl} target="_blank" rel="noreferrer">打开视频 ↗</a>)}</div>
          </article>
        )) : <div className="dev-empty"><b>还没有管理员教程</b><p>上传图文内容或绑定第三方平台视频后，教程会显示在这里。</p></div>}
      </section>
    </main>
  );
}
