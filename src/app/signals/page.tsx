import type { Metadata } from "next";
import Link from "next/link";
import { SignalCard } from "@/components/signal-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { QuantVisualCanvas } from "@/components/quant-visual-canvas";
import { getSignals } from "@/lib/signal-data";

export const metadata: Metadata = {
  title: "策略信号中心",
  description: "浏览经过持续监测的 MT4/MT5 策略信号、收益曲线与风险指标。",
};

export const dynamic = "force-dynamic";

export default async function SignalsPage() {
  const signals = await getSignals();

  return (
    <main className="home-shell">
      <div className="editorial-sheet">
        <SiteNav active="signals" />

        <section className="hero editorial-hero">
          <QuantVisualCanvas />
          <div className="hero-copy">
            <span className="editorial-label">系统化策略洞察 · SYSTEMATIC INTELLIGENCE</span>
            <h1 className="signal-hero-title">策略信号中心</h1>
            <p className="signal-hero-description">追踪全球可靠策略信号，提供清晰透明的绩效数据。</p>
          </div>
        </section>

        <section className="signals-section" aria-labelledby="signals-title">
          <div className="section-heading">
            <div><span className="editorial-label">策略监测 · STRATEGY MONITOR</span><h2 id="signals-title">策略信号中心</h2></div>
            <span className="count-pill">{String(signals.length).padStart(2, "0")} 个策略 · SIGNALS</span>
          </div>
          <div className="signals-grid">{signals.map((signal, index) => <SignalCard key={signal.id} signal={signal} index={index + 1} />)}</div>
        </section>

        <SiteFooter notice="仅作信息展示，不构成投资建议。历史表现不代表未来结果。" />
      </div>
      <Link href="/agent" className="agent-float" aria-label="打开 AI 写 MT5 策略"><i>Σ</i><span><b>AI 写策略</b><small>生成 MQL5 代码</small></span><strong>→</strong></Link>
    </main>
  );
}
