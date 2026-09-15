import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { formatGa } from "@/lib/marketplace/currency";
import { listUserOrders } from "@/lib/marketplace/orders";

export const dynamic = "force-dynamic";
export const metadata = { title: "我的订单 | Sigma Signal" };
export default async function OrdersPage() {
  const user = await getCurrentUser(); if (!user) redirect("/developer/login?next=/account/orders");
  const orders = listUserOrders(user.id);
  return <main className="platform-shell developer-shell"><SiteNav active="developer" /><div className="platform-breadcrumb"><Link href="/developer">← 返回个人中心</Link><span>MY ORDERS</span></div><header className="dev-form-header"><span className="panel-code">PURCHASE HISTORY</span><h1>我的订单</h1><p>当前余额：<b>{formatGa(user.gaBalance)}</b>。查看 Gas 消费记录并重新下载交付文件。</p></header><section className="dev-product-list">{orders.length ? orders.map((order) => <article className="dev-product-row" key={order.id}><div className="dev-product-info"><b>{order.productName}</b><p>{order.id} · {formatGa(order.amount)} · {order.status === "confirmed" ? "已确认" : "已退款"}</p><small>{new Date(order.createdAt).toLocaleString("zh-CN")}</small></div>{order.status === "confirmed" && <a href={order.downloadUrl}>重新下载</a>}</article>) : <div className="dev-empty"><b>还没有订单</b><p>使用 Gas 购买的商品会显示在这里。</p><Link href="/marketplace">浏览商城 →</Link></div>}</section></main>;
}
