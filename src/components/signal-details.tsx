"use client";

import { useState } from "react";
import type { SignalData } from "@/lib/signal-data";
import { PerformanceChart } from "./performance-chart";

const percent = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PAGE_SIZE = 20;

function Metric({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return <div className="metric"><span>{label}</span><b className={tone}>{value}</b></div>;
}

export function SignalDetails({ signal }: { signal: SignalData }) {
  const currency = new Intl.NumberFormat("zh-CN", { style: "currency", currency: signal.currency, maximumFractionDigits: 2 });
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(signal.tradesHistory.length / PAGE_SIZE));
  const visibleTrades = signal.tradesHistory.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageNumbers = Array.from(new Set([1, page - 1, page, page + 1, pageCount].filter(number => number >= 1 && number <= pageCount))).sort((a, b) => a - b);

  return (
      <div className="details-flow">
        <section className="chart-panel performance-panel" aria-labelledby="performance-heading">
          <div className="panel-heading"><div><span className="panel-label">PERFORMANCE MONITOR</span><h2 id="performance-heading">累计收益与资金曲线</h2><p className="muted">可独立显示或隐藏曲线；资金使用左轴（{signal.currency}），收益率使用右轴（%）。</p></div><div className="chart-summary"><span>结余 <b>{currency.format(signal.balance)}</b></span><span>收益 <b>+{percent.format(signal.growth)}%</b></span></div></div>
          <PerformanceChart data={signal.curve} currency={signal.currency} />
        </section>

        <section className="panel-only" aria-labelledby="returns-heading">
          <div className="panel-heading"><div><span className="panel-label">RETURN MATRIX</span><h2 id="returns-heading">月度收益表现</h2></div><span className="muted">单位：%</span></div>
          <div className="returns-table"><div className="return-row return-header"><span>年份</span>{Array.from({ length: 12 }, (_, i) => <span key={i}>{i + 1}月</span>)}<span>全年</span></div>{signal.monthlyReturns.map(row => <div className="return-row" key={row.year}><strong>{row.year}</strong>{row.values.map((value, i) => <span className={value === null ? "empty" : value >= 0 ? "up" : "down"} key={i}>{value === null ? "—" : `${value > 0 ? "+" : ""}${percent.format(value)}%`}</span>)}<b className={row.total >= 0 ? "up" : "down"}>{row.total > 0 ? "+" : ""}{percent.format(row.total)}%</b></div>)}</div>
          <div className="monthly-mobile">
            {signal.monthlyReturns.map(row => <section className="monthly-year" key={row.year}>
              <div className="monthly-year-heading"><strong>{row.year} 年</strong><span>全年 <b className={row.total >= 0 ? "up" : "down"}>{row.total > 0 ? "+" : ""}{percent.format(row.total)}%</b></span></div>
              <div className="monthly-values">{row.values.map((value, i) => <span key={i}><small>{i + 1}月</small><b className={value === null ? "empty" : value >= 0 ? "up" : "down"}>{value === null ? "—" : `${value > 0 ? "+" : ""}${percent.format(value)}%`}</b></span>)}</div>
            </section>)}
          </div>
        </section>

        <section aria-labelledby="statistics-heading"><div className="section-title"><span className="panel-label">TRADING METRICS</span><h2 id="statistics-heading">核心交易指标</h2></div><div className="stats-grid"><Metric label="初始入金" value={currency.format(signal.initialDeposit)} /><Metric label="净利润" value={currency.format(signal.profit)} tone="positive" /><Metric label="累计出金" value={currency.format(signal.withdrawals)} /><Metric label="总交易数" value={`${signal.trades} 笔`} /><Metric label="盈利次数（比例）" value={`${signal.profitTrades} (${percent.format(signal.winRate)}%)`} tone="positive" /><Metric label="亏损次数（比例）" value={`${signal.lossTrades} (${percent.format(100 - signal.winRate)}%)`} tone="negative" /><Metric label="最佳交易盈利" value={currency.format(signal.bestTrade)} tone="positive" /><Metric label="最差交易亏损" value={currency.format(signal.worstTrade)} tone="negative" /><Metric label="平均持仓时长" value={`${signal.averageHoldHours} 小时`} /></div></section>

        <section className="panel-only history-panel" aria-labelledby="history-heading">
          <div className="panel-heading"><div><span className="panel-label">EXECUTION LOG</span><h2 id="history-heading">已平仓交易</h2></div><span className="muted">每页 20 笔 · 已加载 {signal.tradesHistory.length} 笔<span className="trade-scroll-hint"> · 左右滑动查看完整字段</span></span></div>
          <div className="trades-table" tabIndex={0} aria-label="交易历史记录表格，可左右滚动查看完整字段"><div className="trade-row trade-header"><span>开仓时间</span><span>类型</span><span>交易量</span><span>交易品种</span><span>开仓价格</span><span>平仓时间</span><span>平仓价格</span><span>佣金</span><span>库存费</span><span>利润</span></div>{visibleTrades.map(trade => <div className="trade-row" key={trade.id}><span>{trade.openedAt}</span><span className={trade.side === "买入" ? "buy" : "sell"}>{trade.side}</span><span>{trade.volume.toFixed(2)}</span><span>{trade.symbol}</span><span>{trade.openPrice.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</span><span>{trade.closedAt}</span><span>{trade.closePrice.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</span><span className="down">{trade.commission.toFixed(2)}</span><span className={trade.swap < 0 ? "down" : undefined}>{trade.swap === 0 ? "—" : trade.swap.toFixed(2)}</span><strong className={trade.profit >= 0 ? "up" : "down"}>{trade.profit.toFixed(2)}</strong></div>)}</div>
          {pageCount > 1 && <nav className="pagination" aria-label="交易历史分页"><button type="button" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page === 1}>上一页</button>{pageNumbers.map((number, index) => <span className="page-item" key={number}>{index > 0 && number - pageNumbers[index - 1] > 1 && <i>…</i>}<button type="button" className={number === page ? "active" : ""} onClick={() => setPage(number)}>{number}</button></span>)}<button type="button" onClick={() => setPage(current => Math.min(pageCount, current + 1))} disabled={page === pageCount}>下一页</button></nav>}
        </section>
      </div>
  );
}
