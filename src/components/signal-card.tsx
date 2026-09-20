import Link from "next/link";
import type { SignalData } from "@/lib/signal-data";
import { PerformanceChart } from "./performance-chart";

const percent = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function SignalCard({ signal, index }: { signal: SignalData; index?: number }) {
  const currency = new Intl.NumberFormat("zh-CN", { style: "currency", currency: signal.currency, maximumFractionDigits: 2 });
  return (
    <Link href={`/signals/${signal.id}`} className="signal-card" aria-label={`查看 ${signal.name} 的详情`}>
      <div className="card-topline">
        <span className="signal-badge">策略{String(index ?? 1).padStart(2, "0")}</span>
        <span className={signal.sourceStatus === "live" ? "data-live" : "data-snapshot"}>
          <i />{signal.sourceStatus === "live" ? "已同步" : "本地快照"}
        </span>
      </div>
      <h2>{signal.name}</h2>
      <p className="muted">{signal.broker}</p>
      <div className="card-return">
        <span>累计收益</span>
        <strong>+{percent.format(signal.growth)}%</strong>
      </div>
      <PerformanceChart data={signal.curve} currency={signal.currency} compact />
      <div className="card-metrics">
        <div><span>净值</span><b>{currency.format(signal.equity)}</b></div>
        <div><span>胜率</span><b>{percent.format(signal.winRate)}%</b></div>
        <div><span>交易</span><b>{signal.trades} 笔</b></div>
      </div>
      <span className="card-action"><span>查看详情</span><small>VIEW DETAILS</small><span className="card-action-arrow" aria-hidden="true">→</span></span>
    </Link>
  );
}
