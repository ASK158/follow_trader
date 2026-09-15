import Link from "next/link";
import { SignalCard } from "@/components/signal-card";
import { SiteNav } from "@/components/site-nav";
import { getSignals } from "@/lib/signal-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const signals = await getSignals();
  const liveSignals = signals.filter((signal) => signal.sourceStatus === "live").length;

  return (
    <main className="home-shell">
      <div className="editorial-sheet">
        <SiteNav active="signals" />

        <section className="hero editorial-hero">
          <div className="hero-copy">
            <span className="editorial-label">系统化策略洞察 · SYSTEMATIC INTELLIGENCE</span>
            <h1>SIGMA<br />BOT</h1>
            <p>不是让数据只解释过去，而是让每一次观察，都沉淀为下一次决策的依据。</p>
          </div>
          <div className="hero-quant-visual" aria-label="抽象三维几何图形" role="img">
            <span className="quant-formula formula-a">三维系统 · 3D SYSTEM</span>
            <span className="quant-formula formula-b">SIGMA / BOT</span>
            <svg viewBox="0 0 460 210" role="presentation">
              <defs>
                <linearGradient id="geoTop" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#fffdf9" />
                  <stop offset="1" stopColor="#e8d7d2" />
                </linearGradient>
                <linearGradient id="geoSide" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#c9848d" />
                  <stop offset="1" stopColor="#9e5661" />
                </linearGradient>
              </defs>
              <ellipse className="geo-shadow" cx="230" cy="174" rx="142" ry="18" />
              <path className="geo-platform-top" d="M82 153 L248 89 L384 132 L215 190 Z" />
              <path className="geo-platform-front" d="M215 190 L384 132 L384 145 L215 203 Z" />
              <path className="geo-platform-side" d="M82 153 L215 190 L215 203 L82 166 Z" />
              <path className="geo-cube-top" d="M169 117 L219 96 L261 109 L210 131 Z" />
              <path className="geo-cube-left" d="M169 117 L210 131 L210 171 L169 155 Z" />
              <path className="geo-cube-right" d="M210 131 L261 109 L261 148 L210 171 Z" />
              <path className="geo-pyramid-left" d="M293 119 L326 77 L326 139 Z" />
              <path className="geo-pyramid-right" d="M326 77 L358 119 L326 139 Z" />
              <path className="geo-pyramid-base" d="M293 119 L326 139 L358 119 L326 104 Z" />
              <circle className="geo-orbit" cx="121" cy="96" r="31" />
              <circle className="geo-orbit geo-orbit-inner" cx="121" cy="96" r="17" />
              <circle className="geo-core" cx="121" cy="96" r="7" />
            </svg>
            <span className="quant-depth-label">抽象决策模型</span>
            <span className="quant-axis axis-x">GEOMETRY / 01</span>
          </div>
          <aside className="hero-notes quant-capabilities" aria-label="量化交易与 AI 分析能力">
            <div className="capability-item"><i>α</i><span><em>量化引擎 · QUANT ENGINE</em><b>因子收益分析与资金曲线监测</b></span></div>
            <div className="capability-item"><i>σ</i><span><em>风险控制 · RISK CONTROL</em><b>回撤、波动率与交易风险评估</b></span></div>
            <div className="capability-item"><i>AI</i><span><em>策略智能体 · STRATEGY AGENT</em><b>自然语言生成和验证 MT5 策略</b></span></div>
            <small><i />{String(liveSignals).padStart(2, "0")} / {String(signals.length).padStart(2, "0")} 策略在线 · SIGNALS ONLINE</small>
          </aside>
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
