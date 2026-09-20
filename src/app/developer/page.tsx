import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { UserAvatar } from "@/components/user-avatar";
import { listUserAgentBillingRequests } from "@/lib/agent/billing";
import { getCurrentDeveloper } from "@/lib/marketplace/auth";
import { formatGa } from "@/lib/marketplace/currency";
import { listUserOrders } from "@/lib/marketplace/orders";
import { listDeveloperProducts, type ProductStatus } from "@/lib/marketplace/products";
import { getPublicProfile } from "@/lib/marketplace/social";
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

const tabMeta = {
  products: { code: "MARKETPLACE WORKS", title: "商城作品", description: "管理已提交的 EA、指标与工具，查看审核状态和公开页面。", actionHref: "/developer/new", actionLabel: "+ 提交商城作品" },
  accounts: { code: "OBSERVATION ACCOUNTS", title: "观摩账号", description: "管理公开展示的 MT4 / MT5 只读观摩账号。", actionHref: "/developer/observation/new", actionLabel: "+ 提交观摩账号" },
  orders: { code: "PURCHASE HISTORY", title: "订单与消费", description: "查看商城订单、交付文件和 Sigma-ai 使用记录。", actionHref: "/account/orders", actionLabel: "查看完整订单" },
} as const;

type DashboardTab = "overview" | "products" | "accounts" | "orders";
type OrderTab = "shop" | "agent";
type Props = { searchParams: Promise<{ submitted?: string; submittedAccount?: string; tab?: string; orderTab?: string }> };

export default async function DeveloperDashboardPage({ searchParams }: Props) {
  const developer = await getCurrentDeveloper();
  if (!developer) redirect("/developer/login");
  const query = await searchParams;
  const tab: DashboardTab = query.tab === "products" || query.tab === "accounts" || query.tab === "orders" ? query.tab : "overview";
  const orderTab: OrderTab = query.orderTab === "agent" ? "agent" : "shop";
  const products = listDeveloperProducts(developer.id);
  const observationAccounts = listUserObservationAccounts(developer.id);
  const orders = listUserOrders(developer.id);
  const agentRequests = listUserAgentBillingRequests(developer.id);
  const submitted = query.submitted === "1";
  const submittedAccount = query.submittedAccount === "1";
  const profile = getPublicProfile(developer.username, developer);
  return (
    <main className="platform-shell developer-shell">
      <SiteNav active="developer" />
      <section className="personal-center-content">
      {tab === "overview" ? <header className="personal-dashboard-header">
        <UserAvatar name={developer.name} src={profile?.avatarUrl ?? null} size={76} />
        <div className="personal-dashboard-identity"><span className="panel-code">PERSONAL CENTER</span><h1>欢迎回来，{developer.name}</h1><p>所有用户均可提交商城作品与观摩账号</p></div>
        <div className="personal-dashboard-balance"><small>可用 Gas</small><b>{formatGa(developer.gaBalance)}</b><Link href="/account/recharge">充值 →</Link></div>
        <div className="personal-dashboard-header-actions"><Link href={`/u/${developer.username}`} className="dev-primary-action">查看个人主页</Link></div>
      </header> : <header className="personal-section-header"><div><span className="panel-code">{tabMeta[tab].code}</span><h1>{tabMeta[tab].title}</h1><p>{tabMeta[tab].description}</p></div><Link href={tabMeta[tab].actionHref} className="dev-primary-action">{tabMeta[tab].actionLabel}</Link></header>}
      {submitted && <p className="dev-notice">✓ 作品已提交，进入审核队列。审核通过后将自动上架。</p>}
      {submittedAccount && <p className="dev-notice">✓ 观摩账号已提交并上架到观摩空间。</p>}
      {tab === "overview" && <><section className="profile-stats" aria-label="个人中心概览"><div><b>{profile?.followerCount ?? 0}</b><span>粉丝</span></div><div><b>{profile?.followingCount ?? 0}</b><span>关注</span></div><div><b>{products.length}</b><span>商城作品</span></div><div><b>{observationAccounts.length}</b><span>观摩账号</span></div><div><b>{profile?.favoriteCount ?? 0}</b><span>作品被收藏</span></div><div><b>{profile?.viewCount ?? 0}</b><span>内容总浏览</span></div></section><div className="dashboard-overview-grid"><section className="dashboard-overview-section"><header><span className="panel-code">CREATE</span><h2>创作与发布</h2><p>选择内容类型，提交后可在头像菜单中查看和管理。</p></header><div className="dashboard-overview-actions"><Link href="/developer/new"><b>提交商城作品 <i>→</i></b><span>发布 EA、指标或其他交易工具。</span></Link><Link href="/developer/observation/new"><b>提交观摩账号 <i>→</i></b><span>展示 MT4 / MT5 只读观摩账户。</span></Link></div></section></div></>}
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
      </section>
      <SiteFooter notice="作品修改后会重新进入审核；观摩账号仅应提交只读密码；订单交付文件可在订单标签页重新下载。" />
    </main>
  );
}