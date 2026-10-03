"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatGa } from "@/lib/marketplace/currency";
import type { CheckinStatus } from "@/lib/marketplace/checkin";

/** 距下一个北京时间（UTC+8）午日的倒计时毫秒数，与 checkin.ts 的日期键保持同一规则。 */
function msUntilNextCheckinDay(now = Date.now()): number {
  const [year, month, day] = new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day + 1) - 8 * 60 * 60 * 1000 - now;
}

function countdownLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = String(Math.floor(total / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

const stateLabels: Record<CheckinStatus["ladder"][number]["state"], string> = {
  done: "已领取",
  today: "今日",
  next: "待解锁",
  upcoming: "待解锁",
};

export function CheckinPanel({ initialStatus }: { initialStatus: CheckinStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [claimed, setClaimed] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(() => countdownLabel(msUntilNextCheckinDay()));

  useEffect(() => {
    const timer = window.setInterval(() => setRemaining(countdownLabel(msUntilNextCheckinDay())), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (claimed === null) return;
    const timer = window.setTimeout(() => setClaimed(null), 2600);
    return () => window.clearTimeout(timer);
  }, [claimed]);

  async function checkin() {
    if (pending || status.checkedInToday) return;
    setPending(true); setError("");
    try {
      const response = await fetch("/api/account/checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await response.json().catch(() => ({})) as { status?: CheckinStatus; result?: { record: { rewardAmount: number } }; error?: string };
      if (!response.ok || !data.status) throw new Error(data.error ?? "打卡失败，请稍后重试");
      setStatus(data.status);
      setClaimed(data.result!.record.rewardAmount);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "打卡失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  const { config } = status;
  return <>
    <section className="checkin-layout" aria-label="每日打卡">
      <article className="recharge-card checkin-hero">
        <div><span className="panel-code">DAILY REWARD</span><h2>每日打卡领 Gas</h2><p>连续打卡奖励逐日递增，坚持越久每天领得越多。</p></div>
        <div className="checkin-streak">
          <small>当前连续</small>
          <b><em>{status.currentStreak}</em> 天</b>
          <span>{status.checkedInToday ? `今日已领 ${formatGa(status.todayReward)}` : `今日打卡可得 ${formatGa(status.todayReward)}`}</span>
        </div>
        <div className="checkin-hero-actions">
          <button type="button" className={`checkin-claim-button${status.checkedInToday ? " done" : ""}`} onClick={checkin} disabled={pending || status.checkedInToday}>
            {status.checkedInToday ? "今日已打卡 ✓" : pending ? "打卡中…" : `立即打卡 +${formatGa(status.todayReward)}`}
          </button>
          {claimed !== null && <span className="checkin-claim-bounce" aria-live="polite">+{formatGa(claimed)} 已到账</span>}
        </div>
        {error && <p className="dev-form-error" role="alert">{error}</p>}
        <dl className="checkin-meta">
          <div><dt>明日可领</dt><dd>{formatGa(status.tomorrowReward)}</dd></div>
          <div><dt>累计打卡</dt><dd>{status.totalCheckins} 次</dd></div>
          <div><dt>累计获得</dt><dd>{formatGa(status.totalEarned)}</dd></div>
        </dl>
        <small className="checkin-countdown">奖励刷新倒计时 {remaining} · 打卡周期按北京时间（UTC+8）计算</small>
      </article>
      <article className="recharge-card checkin-ladder-card">
        <div><span className="panel-code">REWARD LADDER</span><h2>连击奖励阶梯</h2><p>每天比前一天多领 {formatGa(config.streakIncrement)}，最高每天 {formatGa(config.maxReward)}。</p></div>
        <ol className="checkin-ladder" aria-label="连续打卡奖励阶梯">
          {status.ladder.map((step) => (
            <li key={step.day} className={`checkin-step ${step.state}`} aria-current={!status.checkedInToday && step.state === "today" ? "step" : undefined}>
              <span className="checkin-step-tag">{stateLabels[step.state]}</span>
              <span className="checkin-step-bar" style={{ height: `${Math.max(12, (step.reward / config.maxReward) * 100)}%` }} aria-hidden="true" />
              <b className="checkin-step-amount">+{formatGa(step.reward)}</b>
              <small className="checkin-step-day">第 {step.day} 天</small>
            </li>
          ))}
        </ol>
        <p className="checkin-ladder-note">连续第 {config.capDay} 天起每天固定 {formatGa(config.maxReward)}；中断打卡后从第 1 天的 {formatGa(config.baseReward)} 重新开始累积。</p>
      </article>
    </section>
    <div className="finance-section-heading"><div><span className="panel-code">CHECK-IN HISTORY</span><h2>打卡记录</h2></div><p>最近 {status.recentRecords.length} 条</p></div>
    <section className="finance-table-wrap"><table className="finance-table"><thead><tr><th>打卡日期</th><th>连击天数</th><th>获得奖励</th></tr></thead><tbody>{status.recentRecords.length ? status.recentRecords.map((record) => <tr key={record.id}><td>{record.checkinDate}</td><td>连续第 {record.streakDays} 天</td><td className="ga-positive">+{formatGa(record.rewardAmount)}</td></tr>) : <tr><td colSpan={3}>还没有打卡记录，今天就开始累积连击吧。</td></tr>}</tbody></table></section>
  </>;
}
