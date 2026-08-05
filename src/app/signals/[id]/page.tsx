import Link from "next/link";
import { notFound } from "next/navigation";
import { SignalDetails } from "@/components/signal-details";
import { getSignal } from "@/lib/signal-data";

export const dynamic = "force-dynamic";

const percent = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function SignalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const signal = await getSignal(id);
  if (!signal) notFound();

  const currency = new Intl.NumberFormat("zh-CN", { style: "currency", currency: signal.currency, maximumFractionDigits: 2 });
  const updatedAt = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(signal.sourceUpdatedAt));
  return (
    <main className="detail-shell">
      <nav className="nav detail-nav"><Link href="/" className="back-link">← 所有策略</Link><div><span className="brand-mark">S</span><span className="brand">Signal Watch</span></div></nav>
      <header className="signal-header">
        <div><div className="title-meta"><span className="signal-badge">MT5</span><span className={signal.sourceStatus === "live" ? "data-live" : "data-snapshot"}><i />{signal.sourceStatus === "live" ? "公开页已同步" : "本地快照"}</span></div><h1>{signal.name}</h1><p>{signal.broker} · 开始于 {new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(signal.startedAt))}</p></div>
        <a className="source-link" href={signal.sourceUrl} target="_blank" rel="noreferrer">查看原始信号 ↗</a>
      </header>
      <section className="overview-grid" aria-label="策略概览">
        <div><span>累计收益</span><b className="positive">+{percent.format(signal.growth)}%</b></div><div><span>净值</span><b>{currency.format(signal.equity)}</b></div><div><span>胜率</span><b>{percent.format(signal.winRate)}%</b></div><div><span>订阅者</span><b>{signal.subscribers}</b></div><div><span>运行周期</span><b>{signal.weeks} 周</b></div>
      </section>
      <SignalDetails signal={signal} />
      <footer className="data-footer">数据状态：{signal.sourceStatus === "live" ? "指标已从 MQL5 公开页同步" : "使用本地快照"} · 更新于 {updatedAt} · 曲线使用本地经核验快照或由导出流水按日重建。仅供信息展示，不构成投资建议。</footer>
    </main>
  );
}
