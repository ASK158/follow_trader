import Link from "next/link";
import { SignalCard } from "@/components/signal-card";
import { SiteNav } from "@/components/site-nav";
import { TypewriterTitle } from "@/components/typewriter-title";
import { QuantVisualCanvas } from "@/components/quant-visual-canvas";
import { getSignals } from "@/lib/signal-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const signals = await getSignals();

  return (
    <main className="home-shell">
      <div className="editorial-sheet">
        <SiteNav active="signals" />

        <section className="hero editorial-hero">
          <QuantVisualCanvas />
          <div className="hero-copy">
            <span className="editorial-label">系统化策略洞察 · SYSTEMATIC INTELLIGENCE</span>
            <h1>
              <TypewriterTitle lines={["SIGMA", "BOT"]} />
            </h1>
            <p>发现可信信号，善用强大工具，构建智能策略，赋能每一次交易决策。</p>
          </div>
        </section>

        <section className="signals-section" aria-labelledby="signals-title">
          <div className="section-heading">
            <div><span className="editorial-label">策略监测 · STRATEGY MONITOR</span><h2 id="signals-title">策略信号中心</h2></div>
            <span className="count-pill">{String(signals.length).padStart(2, "0")} 个策略 · SIGNALS</span>
          </div>
          <div className="signals-grid">{signals.map((signal, index) => <SignalCard key={signal.id} signal={signal} index={index + 1} />)}</div>
        </section>

        <footer className="editorial-footer">
          <b>SIGMA 信号 · 数据洞察 / DATA WITH CONTEXT</b>
          <p>仅作信息展示，不构成投资建议。历史表现不代表未来结果。</p>
        </footer>
      </div>
      <Link href="/agent" className="agent-float" aria-label="打开 AI 写 MT5 策略"><i>Σ</i><span><b>AI 写策略</b><small>生成 MQL5 代码</small></span><strong>→</strong></Link>
    </main>
  );
}
