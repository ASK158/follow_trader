"use client";

import { useEffect, useState } from "react";
import type { PublicLiveSignal } from "@/lib/sigmac/relay-store";

type Props = { initialSignals: PublicLiveSignal[]; staleSeconds: number };

const volumeFormat = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const priceFormat = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 5 });

function currencyFormat(currency: string | null) {
  try {
    return new Intl.NumberFormat("zh-CN", { style: "currency", currency: currency ?? "USD", maximumFractionDigits: 2 });
  } catch {
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
  }
}

function relativeTime(iso: string, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  return `${Math.floor(seconds / 3600)} 小时前`;
}

function clockTime(unixMs: number): string {
  return new Date(unixMs).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export function LiveSignalsBoard({ initialSignals, staleSeconds }: Props) {
  const [signals, setSignals] = useState<PublicLiveSignal[]>(initialSignals);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const poll = window.setInterval(async () => {
      try {
        const response = await fetch("/api/sigmac/signals", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as { signals: PublicLiveSignal[] };
        setSignals(data.signals);
        setError(null);
      } catch {
        setError("实时数据刷新失败，正在展示上次收到的数据");
      }
    }, 5000);
    const tick = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, []);

  if (signals.length === 0) {
    return (
      <div className="sigmac-empty">
        <b>暂无实时信号</b>
        <p>实时信号由已授权的发布器从交易终端直接推送至本站。发布器未连接、未上报或数据超时时，此处保持为空，不会展示过期持仓。</p>
      </div>
    );
  }

  return (
    <div className="sigmac-board">
      {error ? <p className="sigmac-error" role="status">{error}</p> : null}
      {signals.map((signal) => {
        const stale = nowMs - new Date(signal.receivedAt).getTime() > staleSeconds * 1_000;
        const currency = currencyFormat(signal.currency);
        return (
          <article key={signal.id} className="sigmac-card">
            <div className="sigmac-topline">
              <span className="sigmac-badge">实时信号</span>
              <span className={`sigmac-status${stale ? " stale" : ""}`}><i />{stale ? "已停止更新" : "实时同步中"}</span>
            </div>
            <h2>{signal.title}</h2>
            <p className="sigmac-meta">
              <span>账户 {signal.id}</span>
              {signal.server ? <span>{signal.server}</span> : null}
              {signal.currency ? <span>{signal.currency} 计价</span> : null}
            </p>
            {signal.account ? (
              <div className="sigmac-metrics">
                <div><span>余额</span><b>{currency.format(signal.account.balance)}</b></div>
                <div><span>净值</span><b>{currency.format(signal.account.equity)}</b></div>
                <div><span>浮动盈亏</span><b className={signal.account.floatingProfit >= 0 ? "sigmac-profit-pos" : "sigmac-profit-neg"}>{currency.format(signal.account.floatingProfit)}</b></div>
                <div><span>可用保证金</span><b>{currency.format(signal.account.marginFree)}</b></div>
              </div>
            ) : null}
            {signal.positions.length === 0 ? (
              <p className="muted sigmac-flat">当前空仓</p>
            ) : (
              <div className="sigmac-table-wrap">
                <table className="sigmac-table">
                  <thead><tr><th>品种</th><th>方向</th><th>手数</th><th>开仓价</th><th>止损</th><th>止盈</th><th>开仓时间</th></tr></thead>
                  <tbody>
                    {signal.positions.map((position) => (
                      <tr key={position.source_id}>
                        <td><b>{position.symbol}</b></td>
                        <td className={position.side === "BUY" ? "sigmac-side-buy" : "sigmac-side-sell"}>{position.side === "BUY" ? "买入" : "卖出"}</td>
                        <td>{volumeFormat.format(position.volume)}</td>
                        <td>{priceFormat.format(position.price_open)}</td>
                        <td>{position.sl > 0 ? priceFormat.format(position.sl) : "—"}</td>
                        <td>{position.tp > 0 ? priceFormat.format(position.tp) : "—"}</td>
                        <td>{clockTime(position.opened_at_unix_ms)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="sigmac-footer"><span>最近更新 {relativeTime(signal.receivedAt, nowMs)}</span><span>序号 #{signal.sequence} · {signal.positionCount} 个持仓</span></p>
          </article>
        );
      })}
    </div>
  );
}
