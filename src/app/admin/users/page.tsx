import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminUserPanel } from "@/components/admin-user-panel";
import { SiteNav } from "@/components/site-nav";
import { listAdminUsers, listAuditLogs } from "@/lib/auth/admin";
import { getCurrentUser, isAdmin } from "@/lib/marketplace/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "用户与审计 | Sigma Bot" };
export default async function AdminUsersPage() {
  const user = await getCurrentUser(); if (!user) redirect("/developer/login?next=/admin/users"); if (!isAdmin(user)) redirect("/developer");
  const users = listAdminUsers(); const logs = listAuditLogs();
  return <main className="platform-shell developer-shell"><SiteNav active="developer" /><div className="platform-breadcrumb"><Link href="/admin">← 返回管理员中心</Link><span>ADMIN / USERS & AUDIT</span></div><header className="dev-form-header"><span className="panel-code">USERS & AUDIT</span><h1>用户管理与审计中心</h1><p>管理用户/管理员角色、账户状态，并检查安全和业务操作记录。积分分配与消费记录请前往 <Link href="/admin/finance">Gas 财务中心 →</Link></p></header><h2>用户（{users.length}）</h2><AdminUserPanel users={users} /><h2>最近审计事件</h2><section className="dev-product-list">{logs.map((log) => <article className="dev-product-row" key={log.id}><div className="dev-product-info"><b>{log.action}</b><p>{log.actorName ?? "系统/匿名"} → {log.targetType}{log.targetId ? ` / ${log.targetId}` : ""}</p><small>{new Date(log.createdAt).toLocaleString("zh-CN")} · {log.metadata}</small></div></article>)}</section></main>;
}
