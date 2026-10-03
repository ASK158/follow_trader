"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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

const ladderStateLabels: Record<CheckinStatus["ladder"][number]["state"], string> = {
  done: "已领取",
  today: "今日",
  next: "待解锁",
  upcoming: "待解锁",
};

type SessionState = { authed: true; status: CheckinStatus } | { authed: false } | null;

function CheckinDialogContent({ session, onStatus, onClose }: { session: { authed: true; status: CheckinStatus }; onStatus: (status: CheckinStatus) => void; onClose: () => void }) {
  const router = useRouter();
  const [status, setStatus] = useState(session.status);
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
      onStatus(data.status);
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
    <div className="checkin-dialog-summary">
      <div className="checkin-streak"><small>当前连续</small><b><em>{status.currentStreak}</em> 天</b></div>
      <dl className="checkin-dialog-stats">
        <div><dt>明日可领</dt><dd>{formatGa(status.tomorrowReward)}</dd></div>
        <div><dt>累计打卡</dt><dd>{status.totalCheckins} 次</dd></div>
        <div><dt>累计获得</dt><dd>{formatGa(status.totalEarned)}</dd></div>
      </dl>
    </div>
    <div className="checkin-dialog-actions">
      <button type="button" className={`checkin-claim-button${status.checkedInToday ? " done" : ""}`} onClick={checkin} disabled={pending || status.checkedInToday}>
        {status.checkedInToday ? `今日已领 ${formatGa(status.todayReward)} ✓` : pending ? "打卡中…" : `立即打卡 +${formatGa(status.todayReward)}`}
      </button>
      {claimed !== null && <span className="checkin-claim-bounce" aria-live="polite">+{formatGa(claimed)} 已到账</span>}
    </div>
    {error && <p className="dev-form-error" role="alert">{error}</p>}
    <ol className="checkin-ladder" aria-label="连续打卡奖励阶梯">
      {status.ladder.map((step) => (
        <li key={step.day} className={`checkin-step ${step.state}`} aria-current={!status.checkedInToday && step.state === "today" ? "step" : undefined}>
          <span className="checkin-step-tag">{ladderStateLabels[step.state]}</span>
          <span className="checkin-step-bar" style={{ height: `${Math.max(12, (step.reward / config.maxReward) * 100)}%` }} aria-hidden="true" />
          <b className="checkin-step-amount">+{formatGa(step.reward)}</b>
          <small className="checkin-step-day">第 {step.day} 天</small>
        </li>
      ))}
    </ol>
    <p className="checkin-dialog-note">连续第 {config.capDay} 天起每天固定 {formatGa(config.maxReward)}；中断后从第 1 天的 {formatGa(config.baseReward)} 重新累积。奖励刷新倒计时 {remaining}（北京时间）。</p>
    {status.recentRecords.length > 0 && <div className="checkin-dialog-recent">
      <small>最近记录</small>
      {status.recentRecords.slice(0, 3).map((record) => <span key={record.id}>{record.checkinDate} 连续第 {record.streakDays} 天 +{formatGa(record.rewardAmount)}</span>)}
      <Link href="/account/checkin" onClick={onClose}>查看完整记录 →</Link>
    </div>}
  </>;
}

export function GlobalFloatActions() {
  const pathname = usePathname();
  const [session, setSession] = useState<SessionState>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/checkin", { cache: "no-store" })
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) { setSession({ authed: false }); return; }
        const data = await response.json().catch(() => null) as { status?: CheckinStatus } | null;
        setSession(data?.status ? { authed: true, status: data.status } : { authed: false });
      })
      .catch(() => { if (!cancelled) setSession({ authed: false }); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const checkinReady = Boolean(session?.authed && session.status && !session.status.checkedInToday);

  return <>
    <div className="float-dock" aria-label="快捷操作">
      {pathname !== "/agent" && (
        <Link href="/agent" className="float-dock-button float-agent" aria-label="打开 AI 写 MT5 策略">
          <i>Σ</i><b>AI 写策略</b>
        </Link>
      )}
      <button type="button" className={`float-dock-button float-checkin${checkinReady ? " ready" : ""}`} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="每日打卡">
        <i aria-hidden="true">✓</i><b>每日打卡</b>
        {session?.authed && <span className={`float-dot${checkinReady ? " ready" : ""}`} aria-hidden="true" />}
      </button>
    </div>
    {open && (
      <div className="dialog-backdrop checkin-dialog-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
        <section className="checkin-dialog" role="dialog" aria-modal="true" aria-labelledby="checkin-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="checkin-dialog-heading">
            <div><span className="panel-code">DAILY CHECK-IN</span><h2 id="checkin-dialog-title">每日打卡领 Gas</h2></div>
            <button type="button" className="dialog-close" onClick={() => setOpen(false)} aria-label="关闭弹出框">×</button>
          </div>
          {session?.authed ? (
            <CheckinDialogContent session={session} onStatus={(status) => setSession({ authed: true, status })} onClose={() => setOpen(false)} />
          ) : (
            <div className="checkin-dialog-login">
              <p>连续打卡奖励逐日递增，坚持越久每天领得越多。登录后即可参与每日打卡。</p>
              <Link href="/developer/login?next=/account/checkin" className="checkin-dialog-login-link" onClick={() => setOpen(false)}>登录 / 注册参与打卡 →</Link>
            </div>
          )}
        </section>
      </div>
    )}
  </>;
}
