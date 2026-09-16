import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DeveloperLogoutButton } from "@/components/developer-logout-button";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { listUserAgentBillingRequests } from "@/lib/agent/billing";
import { getCurrentDeveloper, isAdmin } from "@/lib/marketplace/auth";
import { formatGa } from "@/lib/marketplace/currency";
import { listUserOrders } from "@/lib/marketplace/orders";
import { listDeveloperProducts, type ProductStatus } from "@/lib/marketplace/products";
import { listUserObservationAccounts } from "@/lib/observation-accounts";

export const metadata: Metadata = { title: "个人中心 | Sigma Bot", description: "管理账户以及你上架的 EA、指标与其他工具。" };

export const dynamic = "force-dynamic";

const statusMeta: Record<ProductStatus, { label: string; className: string }> = {
  pending: { label: "审核中", className: "status-pending" },
  approved: { label: "已上架", className: "status-approved" },
  rejected: { label: "已驳回", className: "status-rejected" },
};

const agentActionMeta = { chat: "AI 对话", modify: "AI 修改", generate: "AI 完整生成" } as const;
const agentSourceMeta = { free: "免费额度", gas: "Gas 扣费", admin: "管理员通道" } as const;
const agentStatusMeta = { committed: "已结算", reserved: "处理中", released: "已退还" } as const;

type DashboardTab = "products" | "accounts" | "orders";
type OrderTab = "shop" | "agent";
type Props = { searchParams: Promise<{ submitted?: string; submittedAccount?: string; tab?: string; orderTab?: string }> };

export default async function DeveloperDashboardPage({ searchParams }: Props) {
  const developer = await getCurrentDeveloper();
  if (!developer) redirect("/developer/login");
  const query = await searchParams;
  const tab: DashboardTab = query.tab === "accounts" || query.tab === "orders" ? query.tab : "products";
  const orderTab: OrderTab = query.orderTab === "agent" ? "agent" : "shop";
  const products = listDeveloperProducts(developer.id);
  const observationAccounts = listUserObservationAccounts(developer.id);
  const orders = listUserOrders(developer.id);
  const agentRequests = listUserAgentBillingRequests(developer.id);
  const submitted = query.submitted === "1";
  const submittedAccount = query.submittedAccount === "1";
  return (
    <main className="platform-shell developer-shell">
      <SiteNav active="developer" />
      <header className="platform-hero dev-hero">
        <div><span className="panel-code">USER DASHBOARD</span><h1>个人中心</h1><p>欢迎，{developer.name}（{developer.email}）。当前余额：<b>{formatGa(developer.gaBalance)}</b>。在这里管理作品、观摩账号和订单。</p></div>
        <div className="dev-hero-actions">
          <Link href="/developer/new" className="dev-primary-action">+ 提交新作品</Link>
          <Link href="/developer/observation/new" className="dev-secondary-action">+ 提交观摩空间账号</Link>
          <Link href="/account" className="dev-secondary-action">账户与安全</Link>
          {isAdmin(developer) && <Link href="/admin/review" className="dev-secondary-action">审核队列</Link>}
          {isAdmin(developer) && <Link href="/admin/tutorials" className="dev-secondary-action">教程管理</Link>}
          {isAdmin(developer) && <Link href="/admin/users" className="dev-secondary-action">用户与审计</Link>}
          {isAdmin(developer) && <Link href="/admin/finance" className="dev-secondary-action">Gas 财务中心</Link>}
          <DeveloperLogoutButton />
        </div>
      </header>
      {submitted && <p className="dev-notice">✓ 作品已提交，进入审核队列。审核通过后将自动上架。</p>}
      {submittedAccount && <p className="dev-notice">✓ 观摩账号已提交并上架到观摩空间。</p>}
      <nav className="dashboard-tabs" aria-label="个人中心内容">
        <Link href="/developer" className={tab === "products" ? "active" : ""} aria-current={tab === "products" ? "page" : undefined}>我的作品 <span>{products.length}</span></Link>
        <Link href="/developer?tab=accounts" className={tab === "accounts" ? "active" : ""} aria-current={tab === "accounts" ? "page" : undefined}>我的观摩账号 <span>{observationAccounts.length}</span></Link>
        <Link href="/developer?tab=orders" className={tab === "orders" ? "active" : ""} aria-current={tab === "orders" ? "page" : undefined}>我的订单 <span>{orders.length + agentRequests.length}</span></Link>
      </nav>
      {tab === "products" && <section className="dev-product-list" aria-label="我的作品列表">
        {products.length === 0 ? (
          <div className="dev-empty"><b>还没有作品</b><p>点击「提交新作品」上传 EA / 指标文件，或发布无需策略文件的模板策略，填写商品信息后进入审核。</p></div>
        ) : products.map((product) => (
          <article key={product.id} className="dev-product-row">
            <div className={`product-cover dev-product-cover${product.coverImage ? " product-cover--image" : ""}`} style={{ "--product-accent": product.accent, "--product-cover-image": product.coverImage ? `url(${JSON.stringify(product.coverImage)})` : undefined } as React.CSSProperties}><span>{product.type}</span><i>Σ</i></div>
            <div className="dev-product-info">
              <div><b>{product.name}</b><span className={`dev-status ${statusMeta[product.status].className}`}>{statusMeta[product.status].label}</span></div>
              <p>{product.tagline}</p>
              <small>{product.category} · {product.platform} · v{product.version} · {formatGa(product.price)} · 销量 {product.sales} · 更新于 {product.updatedAt}</small>
              {product.status === "rejected" && product.reviewNote && <p className="dev-review-note">驳回原因:{product.reviewNote}</p>}
            </div>
            <div className="dev-product-actions">
              <Link href={`/developer/products/${product.id}`}>编辑</Link>
              {product.status === "approved" && <Link href={`/marketplace/${product.id}`}>查看页面 →</Link>}
            </div>
          </article>
        ))}
      </section>}
      {tab === "accounts" && <section className="dev-product-list" aria-label="我的观摩账号列表">
        {observationAccounts.length === 0 ? <div className="dev-empty"><b>还没有观摩账号</b><p>提交 MT4 / MT5 只读观摩账号与图文介绍，即可在观摩空间公开展示。</p><Link href="/developer/observation/new">提交观摩账号 →</Link></div> : observationAccounts.map((account) => (
          <article key={account.id} className="dev-product-row observation-dashboard-row">
            <div className="observation-mini-cover"><span>{account.platform}</span><b>{account.accountType}</b><i>●</i></div>
            <div className="dev-product-info"><div><b>{account.title}</b><span className="dev-status status-approved">已上架</span></div><p>{account.summary}</p><small>{account.serverName} · 账号 {account.accountNumber} · 浏览 {account.views} · 评论 {account.commentCount}</small></div>
            <div className="dev-product-actions"><Link href={`/observation/${account.id}`}>查看页面 →</Link></div>
          </article>
        ))}
      </section>}
      {tab === "orders" && <section className="dev-product-list" aria-label="我的订单列表">
        <nav className="order-subtabs" aria-label="订单分类">
          <Link href="/developer?tab=orders" className={orderTab === "shop" ? "active" : ""} aria-current={orderTab === "shop" ? "page" : undefined}>商城订单 <span>{orders.length}</span></Link>
          <Link href="/developer?tab=orders&orderTab=agent" className={orderTab === "agent" ? "active" : ""} aria-current={orderTab === "agent" ? "page" : undefined}>Sigma-ai 订单 <span>{agentRequests.length}</span></Link>
        </nav>
        {orderTab === "shop" ? (
          orders.length === 0 ? <div className="dev-empty"><b>还没有订单</b><p>使用 Gas 购买的商品会显示在这里。</p><Link href="/marketplace">浏览商城 →</Link></div> : orders.map((order) => (
            <article className="dev-product-row dashboard-order-row" key={order.id}><div className="dev-product-info"><b>{order.productName}</b><p>{order.id} · {formatGa(order.amount)} · {order.status === "confirmed" ? "已确认" : "已退款"}</p><small>{new Date(order.createdAt).toLocaleString("zh-CN")}</small></div>{order.status === "confirmed" && <a className="dashboard-download" href={order.downloadUrl}>重新下载</a>}</article>
          ))
        ) : (
          agentRequests.length === 0 ? <div className="dev-empty"><b>还没有 Sigma-ai 消费记录</b><p>在 AI 实验室使用 Agent 生成策略、对话或修改产生的消费记录会显示在这里。</p><Link href="/agent">前往 AI 实验室 →</Link></div> : agentRequests.map((record) => (
            <article className="dev-product-row dashboard-order-row" key={record.requestId}>
              <div className="dev-product-info">
                <b>{agentActionMeta[record.action]}</b>
                <p>{record.requestId} · {agentSourceMeta[record.source]} · {agentStatusMeta[record.status]}{record.source === "gas" && record.status === "committed" ? ` · 实扣 ${formatGa(record.gasAmount)}` : record.source === "gas" && record.reservedGasAmount > 0 ? ` · 预授权 ${formatGa(record.reservedGasAmount)}` : ""}</p>
                <small>{new Date(record.createdAt).toLocaleString("zh-CN")}</small>
              </div>
            </article>
          ))
        )}
      </section>}
      <SiteFooter notice="作品修改后会重新进入审核；观摩账号仅应提交只读密码；订单交付文件可在订单标签页重新下载。" />
    </main>
  );
}