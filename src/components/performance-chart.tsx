"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CurvePoint, SignalData } from "@/lib/signal-data";

type Props = { data: CurvePoint[]; compact?: boolean; currency?: SignalData["currency"] };

export function PerformanceChart({ data, compact = false, currency: currencyCode = "USD" }: Props) {
  const currency = new Intl.NumberFormat("zh-CN", { style: "currency", currency: currencyCode, maximumFractionDigits: 0 });
  const [visibleSeries, setVisibleSeries] = useState({ growth: true, balance: false });
  const chartTopMargin = compact ? 18 : 62;
  const toggleSeries = (series: "growth" | "balance") => {
    setVisibleSeries(current => ({ ...current, [series]: !current[series] }));
  };

  return (
    <div className={compact ? "chart chart-compact" : "chart chart-performance"}>
      {!compact && <div className="chart-controls" aria-label="选择图表曲线">
        <button type="button" className={visibleSeries.growth ? "selected growth-control" : "growth-control"} onClick={() => toggleSeries("growth")} aria-pressed={visibleSeries.growth}><i />收益率</button>
        <button type="button" className={visibleSeries.balance ? "selected balance-control" : "balance-control"} onClick={() => toggleSeries("balance")} aria-pressed={visibleSeries.balance}><i />资金</button>
      </div>}
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: chartTopMargin, right: compact ? 4 : 18, left: compact ? -28 : 14, bottom: 0 }}>
          <defs>
            <linearGradient id="fill-growth" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#b51f32" stopOpacity={0.2} /><stop offset="100%" stopColor="#b51f32" stopOpacity={0.01} /></linearGradient>
            <linearGradient id="fill-balance" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#5cc49a" stopOpacity={0.16} /><stop offset="100%" stopColor="#5cc49a" stopOpacity={0.01} /></linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#ded6ca" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: "#857c71", fontSize: compact ? 10 : 12 }} tickFormatter={(value: string) => new Intl.DateTimeFormat("zh-CN", { month: "short", year: compact ? undefined : "2-digit" }).format(new Date(value))} minTickGap={compact ? 42 : 68} />
          {(compact || visibleSeries.balance) && <YAxis yAxisId={compact ? "growth" : "balance"} tickLine={false} axisLine={false} width={compact ? 36 : 72} tick={{ fill: compact ? "#a52335" : "#537665", fontSize: compact ? 10 : 12 }} tickFormatter={(value: number) => compact ? `${value}%` : currency.format(value)} />}
          {!compact && visibleSeries.growth && <YAxis yAxisId="growth" orientation="right" tickLine={false} axisLine={false} width={53} tick={{ fill: "#a52335", fontSize: 12 }} tickFormatter={(value: number) => `${value}%`} />}
          <Tooltip cursor={{ stroke: "#bac8da", strokeDasharray: "4 4" }} contentStyle={{ border: "1px solid #dfe7f0", borderRadius: 10, boxShadow: "0 10px 30px rgba(20, 41, 70, .12)" }} labelFormatter={(value) => new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(new Date(String(value)))} formatter={(value, name) => [name === "收益率" ? `${Number(value).toFixed(2)}%` : currency.format(Number(value)), name]} />
          {!compact && visibleSeries.balance && <Area yAxisId="balance" type="monotone" dataKey="balance" name="资金" stroke="#5cc49a" strokeWidth={2.3} fill="url(#fill-balance)" dot={false} activeDot={{ r: 4 }} />}
          {(compact || visibleSeries.growth) && <Area yAxisId="growth" type="monotone" dataKey="growth" name="收益率" stroke="#b51f32" strokeWidth={2.2} fill={compact ? "url(#fill-growth)" : "none"} dot={false} activeDot={{ r: 4 }} />}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
