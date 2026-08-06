import Link from "next/link";
import { notFound } from "next/navigation";
import { SignalDetails } from "@/components/signal-details";
import { getSignal } from "@/lib/signal-data";

export const dynamic = "force-dynamic";

const percent = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function getAnnualizedReturn(growth: number, startedAt: string, updatedAt: string): number {
  const elapsedDays = Math.max(1, (new Date(updatedAt).getTime() - new Date(startedAt).getTime()) / 86_400_000);
  return (Math.pow(1 + growth / 100, 365.2425 / elapsedDays) - 1) * 100;
}

function getRunningMonths(startedAt: string, updatedAt: string): number {
  return Math.max(1, Math.floor((new Date(updatedAt).getTime() - new Date(startedAt).getTime()) / (30.4375 * 86_400_000)));
}

export default async function SignalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const signal = await getSignal(id);
  if (!signal) notFound();

  const sourceUpdatedDate = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeZone: "Asia/Shanghai" }).format(new Date(signal.sourceUpdatedAt));
  const updatedAt = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(signal.sourceUpdatedAt));
  const annualizedReturn = getAnnualizedReturn(signal.growth, signal.startedAt, signal.sourceUpdatedAt);
  const runningMonths = getRunningMonths(signal.startedAt, signal.sourceUpdatedAt);
  return (
    <main className="detail-shell">
      <nav className="nav detail-nav"><Link href="/" className="back-link">← 所有策略</Link><div><span className="brand-mark">S</span><span className="brand">Signal Watch</span></div></nav>
      <header className="signal-header">
        <div><div className="title-meta"><span className="signal-badge">MT5</span><span className={signal.sourceStatus === "live" ? "data-live" : "data-snapshot"}><i />{signal.sourceStatus === "live" ? "公开页已同步" : "本地快照"}</span></div><h1 className="signal-title"><span>{signal.name}</span><small>数据更新：{sourceUpdatedDate}</small></h1><p>{signal.broker} · 开始于 {new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(signal.startedAt))}</p></div>
        <a className="source-link" href={signal.sourceUrl} target="_blank" rel="noreferrer">查看原始信号 ↗</a>
      </header>
      <section className="overview-grid" aria-label="策略概览">
        <div><span>累计收益率</span><b className="positive">+{percent.format(signal.growth)}%</b></div><div><span>年化收益率</span><b className="positive">+{percent.format(annualizedReturn)}%</b></div><div><span>胜率</span><b>{percent.format(signal.winRate)}%</b></div><div><span>最大回撤</span><b className="negative">-{percent.format(signal.maxDrawdown ?? 0)}%</b></div><div><span>运行时长</span><b>{runningMonths} 月</b></div>
      </section>
      <SignalDetails signal={signal} />
      <footer className="data-footer">数据更新说明：每日北京时间 08:00 同步 MQL5 公开页指标和已授权交易流水。数据状态：{signal.sourceStatus === "live" ? "本次公开页同步成功" : "使用本地快照"} · 最近更新于 {updatedAt} · 上游不可用或解析失败时保留上次成功数据；曲线使用本地经核验快照或由导出流水按日重建。仅供信息展示，不构成投资建议。</footer>
    </main>
  );
}
