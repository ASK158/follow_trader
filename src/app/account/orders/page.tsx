import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { listUserAgentBillingRequests } from "@/lib/agent/billing";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { formatGa } from "@/lib/marketplace/currency";
import { listUserOrders } from "@/lib/marketplace/orders";

export const dynamic = "force-dynamic";
export const metadata = { title: "我的订单 | Sigma Bot" };

const agentActionMeta = { chat: "AI 对话", modify: "AI 修改", generate: "AI 完整生成" } as const;
const agentSourceMeta = { free: "免费额度", gas: "Gas 扣费", admin: "管理员通道" } as const;
const agentStatusMeta = { committed: "已结算", reserved: "处理中", released: "已退还" } as const;

type OrderTab = "shop" | "agent";
type Props = { searchParams: Promise<{ orderTab?: string }> };

export default async function OrdersPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/developer/login?next=/account/orders");
  const query = await searchParams;
  const orderTab: OrderTab = query.orderTab === "agent" ? "agent" : "shop";
  const orders = listUserOrders(user.id);
  const agentRequests = listUserAgentBillingRequests(user.id);
  return (
    <main className="platform-shell developer-shell">
      <SiteNav active="developer" />
      <div className="platform-breadcrumb"><Link href="/developer">← 返回个人中心</Link><span>MY ORDERS</span></div>
      <section className="personal-center-content">
      <header className="dev-form-header"><span className="panel-code">PURCHASE HISTORY</span><h1>我的订单</h1><p>当前余额：<b>{formatGa(user.gaBalance)}</b>。查看 Gas 消费记录并重新下载交付文件。</p></header>
      <section className="dev-product-list" aria-label="我的订单列表">
        <nav className="order-subtabs" aria-label="订单分类">
          <Link href="/account/orders" className={orderTab === "shop" ? "active" : ""} aria-current={orderTab === "shop" ? "page" : undefined}>商城订单 <span>{orders.length}</span></Link>
          <Link href="/account/orders?orderTab=agent" className={orderTab === "agent" ? "active" : ""} aria-current={orderTab === "agent" ? "page" : undefined}>Sigma-ai 订单 <span>{agentRequests.length}</span></Link>
        </nav>
        {orderTab === "shop" ? (
          orders.length ? orders.map((order) => <article className="dev-product-row" key={order.id}><div className="dev-product-info"><b>{order.productName}</b><p>{order.id} · {formatGa(order.amount)} · {order.status === "confirmed" ? "已确认" : "已退款"}</p><small>{new Date(order.createdAt).toLocaleString("zh-CN")}</small></div>{order.status === "confirmed" && <a href={order.downloadUrl}>重新下载</a>}</article>) : <div className="dev-empty"><b>还没有订单</b><p>使用 Gas 购买的商品会显示在这里。</p><Link href="/marketplace">浏览商城 →</Link></div>
        ) : (
          agentRequests.length ? agentRequests.map((record) => <article className="dev-product-row" key={record.requestId}><div className="dev-product-info"><b>{agentActionMeta[record.action]}</b><p>{record.requestId} · {agentSourceMeta[record.source]} · {agentStatusMeta[record.status]}{record.source === "gas" && record.status === "committed" ? ` · 实扣 ${formatGa(record.gasAmount)}` : record.source === "gas" && record.reservedGasAmount > 0 ? ` · 预授权 ${formatGa(record.reservedGasAmount)}` : ""}</p><small>{new Date(record.createdAt).toLocaleString("zh-CN")}</small></div></article>) : <div className="dev-empty"><b>还没有 Sigma-ai 消费记录</b><p>在 AI 实验室使用 Agent 生成策略、对话或修改产生的消费记录会显示在这里。</p><Link href="/agent">前往 AI 实验室 →</Link></div>
        )}
      </section>
      </section>
    </main>
  );
}