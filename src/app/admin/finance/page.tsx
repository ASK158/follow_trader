import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminAgentModelConfig } from "@/components/admin-agent-model-config";
import { AdminFinancePanel } from "@/components/admin-finance-panel";
import { AdminPlatformSettings } from "@/components/admin-platform-settings";
import { SiteNav } from "@/components/site-nav";
import { listAdminUsers } from "@/lib/auth/admin";
import { getCurrentUser, isAdmin } from "@/lib/marketplace/auth";
import { formatGa } from "@/lib/marketplace/currency";
import { getFinanceSummary, listGaTransactions, type GaTransactionType } from "@/lib/marketplace/ga";
import { listFinanceOrders } from "@/lib/marketplace/orders";
import { getAdminAgentModelConfig } from "@/lib/agent/model-config";
import { getPlatformSettings } from "@/lib/platform-settings";
import { listAdminRecharges } from "@/lib/payments/recharges";
import { getAgentOperationsSummary } from "@/lib/agent/metrics";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gas 财务中心 | Sigma Bot" };

const transactionLabels: Record<GaTransactionType, string> = {
  admin_grant: "管理员发放",
  admin_deduct: "管理员扣减",
  purchase: "商品消费",
  refund: "订单退款",
  agent_charge: "Agent 消费",
  agent_refund: "Agent 退还",
  crypto_recharge: "USDT 充值",
};

export default async function AdminFinancePage() {
  const actor = await getCurrentUser();
  if (!actor) redirect("/developer/login?next=/admin/finance");
  if (!isAdmin(actor)) redirect("/developer");
  const [users, transactions, orders, recharges] = [listAdminUsers(), listGaTransactions(), listFinanceOrders(), listAdminRecharges()];
  const summary = getFinanceSummary();
  const platformSettings = getPlatformSettings();
  const agentModelConfig = getAdminAgentModelConfig();
  const agentOps = getAgentOperationsSummary(24);
  return (
    <main className="platform-shell developer-shell">
      <SiteNav active="developer" />
      <div className="platform-breadcrumb"><Link href="/admin">← 返回管理员中心</Link><span>ADMIN / GAS FINANCE</span></div>
      <header className="dev-form-header"><span className="panel-code">FINANCE CONTROL CENTER</span><h1>Gas 财务中心</h1><p>查看平台积分余额、用户消费与账本流水，并由管理员发放或扣减 Gas。每次变更都会写入不可覆盖的交易记录和审计日志。</p></header>
      <section className="finance-summary" aria-label="财务概览">
        <article><small>用户当前总余额</small><b>{formatGa(summary.totalBalance)}</b></article>
        <article><small>USDT 累计充值</small><b>{formatGa(summary.totalRecharged)}</b></article>
        <article><small>累计发放</small><b>{formatGa(summary.totalGranted)}</b></article>
        <article><small>累计消费</small><b>{formatGa(summary.totalSpent)}</b></article>
        <article><small>Agent 用量</small><b>{summary.agentFreeRequestCount + summary.agentPaidRequestCount} 次</b><span>对话 {summary.agentChatRequestCount} · 修改 {summary.agentModifyRequestCount} · 完整生成 {summary.agentGenerateRequestCount}</span><span>免费 {summary.agentFreeRequestCount} · 付费 {summary.agentPaidRequestCount} · {formatGa(summary.agentSpent)}</span></article>
        <article><small>已确认订单</small><b>{summary.confirmedOrderCount}</b><span>{formatGa(summary.confirmedOrderVolume)}</span></article>
      </section>
      <div className="finance-section-heading"><div><span className="panel-code">AGENT OPERATIONS · 24H</span><h2>AI 运行监控</h2></div><p>请求、Provider、编译队列与熔断器实时聚合</p></div>
      <section className="finance-summary" aria-label="AI 运行监控">
        <article><small>请求 / 成功率</small><b>{agentOps.requests} / {(agentOps.successRate * 100).toFixed(1)}%</b><span>失败 {agentOps.failed} · 取消 {agentOps.cancelled}</span></article>
        <article><small>Provider 平均耗时</small><b>{Math.round(agentOps.provider_latency_ms)} ms</b><span>输出约 {agentOps.output_tokens} Tokens</span></article>
        <article><small>编译成功率</small><b>{(agentOps.compilationSuccessRate * 100).toFixed(1)}%</b><span>{agentOps.compilationTotal} 个已完成编译任务 · 平均 {Math.round(agentOps.compile_latency_ms)} ms</span></article>
        <article><small>队列 / 熔断</small><b>{(agentOps.queue as Array<{ status: string; count: number }>).filter((item) => item.status === "queued" || item.status === "running").reduce((total, item) => total + item.count, 0)} 个处理中</b><span>{(agentOps.circuits as Array<{ state: string }>).filter((item) => item.state !== "closed").length} 个异常 Provider</span></article>
      </section>
      <AdminAgentModelConfig initialConfig={agentModelConfig} />
      <AdminPlatformSettings settings={platformSettings} />
      <div className="finance-section-heading"><div><span className="panel-code">BALANCE OPERATIONS</span><h2>用户积分</h2></div><p>扣减不能使余额低于 0；数量只允许正整数。</p></div>
      <AdminFinancePanel users={users} />
      <div className="finance-section-heading"><div><span className="panel-code">CRYPTO RECHARGES</span><h2>USDT 充值记录</h2></div><p>提现请在 NOWPayments Custody 后台手动执行</p></div>
      <section className="finance-table-wrap"><table className="finance-table"><thead><tr><th>时间</th><th>用户</th><th>充值单</th><th>金额</th><th>状态</th><th>实际支付 / Gas</th></tr></thead><tbody>{recharges.length ? recharges.map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString("zh-CN")}</td><td><b>{item.userName}</b><small>{item.userEmail}</small></td><td>{item.id}<small>{item.paymentId ?? "未生成支付编号"}</small></td><td>{item.amount.toFixed(2)} USDT</td><td>{item.status}</td><td>{item.actuallyPaid ? `${item.actuallyPaid} USDT` : "—"}<small>{item.status === "credited" ? formatGa(item.gasAmount) : "未入账"}</small></td></tr>) : <tr><td colSpan={6}>暂无充值记录</td></tr>}</tbody></table></section>
      <div className="finance-section-heading"><div><span className="panel-code">GAS LEDGER</span><h2>积分流水</h2></div><p>最近 {transactions.length} 条</p></div>
      <section className="finance-table-wrap"><table className="finance-table"><thead><tr><th>时间</th><th>用户</th><th>类型</th><th>变动</th><th>变动后余额</th><th>操作者 / 原因</th></tr></thead><tbody>{transactions.length ? transactions.map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString("zh-CN")}</td><td><b>{item.userName}</b><small>{item.userEmail}</small></td><td>{transactionLabels[item.type]}</td><td className={item.amount > 0 ? "ga-positive" : "ga-negative"}>{item.amount > 0 ? "+" : ""}{formatGa(item.amount)}</td><td>{formatGa(item.balanceAfter)}</td><td>{item.actorName ?? "系统"}<small>{item.reason}{item.orderId ? ` · ${item.orderId}` : ""}</small></td></tr>) : <tr><td colSpan={6}>暂无积分流水</td></tr>}</tbody></table></section>
      <div className="finance-section-heading"><div><span className="panel-code">CONSUMPTION RECORDS</span><h2>消费订单</h2></div><p>最近 {orders.length} 笔</p></div>
      <section className="finance-table-wrap"><table className="finance-table"><thead><tr><th>时间</th><th>订单</th><th>用户</th><th>商品</th><th>金额</th><th>状态</th></tr></thead><tbody>{orders.length ? orders.map((order) => <tr key={order.id}><td>{new Date(order.createdAt).toLocaleString("zh-CN")}</td><td>{order.id}</td><td><b>{order.buyerName ?? "未知用户"}</b><small>{order.buyerEmail}</small></td><td>{order.productName}</td><td>{formatGa(order.amount)}</td><td>{order.status === "confirmed" ? "已确认" : "已退款"}</td></tr>) : <tr><td colSpan={6}>暂无消费记录</td></tr>}</tbody></table></section>
    </main>
  );
}