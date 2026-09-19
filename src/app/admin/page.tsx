import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { getCurrentUser, isAdmin } from "@/lib/marketplace/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "管理员中心 | Sigma Bot", description: "集中管理审核、教程、用户权限与 Gas 财务。" };

const adminTools = [
  { href: "/admin/review", label: "审核队列", description: "审核开发者提交的商城作品，并处理上架或驳回。" },
  { href: "/admin/tutorials", label: "教程管理", description: "创建、编辑和发布平台图文及视频教程。" },
  { href: "/admin/users", label: "用户与审计", description: "设置管理员权限、账户状态并查看审计记录。" },
  { href: "/admin/finance", label: "Gas 财务中心", description: "管理 Gas、充值、Agent 配置和平台财务设置。" },
] as const;

export default async function AdminCenterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/developer/login?next=/admin");
  if (!isAdmin(user)) redirect("/developer");

  return (
    <main className="platform-shell developer-shell">
      <SiteNav active="developer" />
      <div className="platform-breadcrumb"><Link href="/developer">← 返回个人中心</Link><span>ADMIN CONTROL CENTER</span></div>
      <header className="dev-form-header"><span className="panel-code">ADMINISTRATION</span><h1>管理员中心</h1><p>所有管理员专属工具集中在这里。各管理页面和接口仍会独立校验管理员权限。</p></header>
      <div className="dashboard-overview-grid">
        <section className="dashboard-overview-section" aria-label="管理员工具">
          <header><span className="panel-code">MANAGEMENT TOOLS</span><h2>管理工具</h2><p>选择要进入的管理模块。</p></header>
          <div className="dashboard-overview-actions">
            {adminTools.map((tool) => <Link href={tool.href} key={tool.href}><b>{tool.label}<i>→</i></b><span>{tool.description}</span></Link>)}
          </div>
        </section>
      </div>
      <SiteFooter notice="管理员操作会根据功能写入审计记录；请仅授予必要的管理权限。" />
    </main>
  );
}
