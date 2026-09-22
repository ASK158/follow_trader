import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountViewerDialog } from "@/components/account-viewer-dialog";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
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
  const annualizedReturn = getAnnualizedReturn(signal.growth, signal.startedAt, signal.sourceUpdatedAt);
  const runningMonths = getRunningMonths(signal.startedAt, signal.sourceUpdatedAt);
  return (
    <main className="detail-shell">
      <SiteNav active="signals" />
      <div className="detail-context-bar"><Link href="/signals" className="back-link"><svg className="back-link-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5M8.5 12H20" /></svg><span>策略中心</span></Link><span>SIGNAL ANALYTICS / {signal.id}</span></div>
      <header className="signal-header">
        <div><div className="title-meta"><span className="signal-badge">MT5 / SIGNAL</span><span className={signal.sourceStatus === "live" ? "data-live" : "data-snapshot"}><i />{signal.sourceStatus === "live" ? "实时数据已同步" : "本地快照数据"}</span></div><h1 className="signal-title"><span>{signal.name}</span><small>更新时间：{sourceUpdatedDate}</small></h1><p>{signal.broker} · 监测起始 {new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(signal.startedAt))}</p></div>
        <AccountViewerDialog />
      </header>
      <section className="overview-grid" aria-label="策略概览">
        <div><span>累计收益率</span><b className="positive">+{percent.format(signal.growth)}%</b></div><div><span>年化收益率</span><b className="positive">+{percent.format(annualizedReturn)}%</b></div><div><span>胜率</span><b>{percent.format(signal.winRate)}%</b></div><div><span>最大回撤</span><b className="negative">-{percent.format(signal.maxDrawdown ?? 0)}%</b></div><div><span>运行时长</span><b>{runningMonths} 月</b></div>
      </section>
      <SignalDetails signal={signal} />
      <SiteFooter notice="仅作信息展示，不构成投资建议。历史表现不代表未来结果。" />
    </main>
  );
}
