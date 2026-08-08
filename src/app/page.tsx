import { SignalCard } from "@/components/signal-card";
import { getSignals } from "@/lib/signal-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const signals = await getSignals();

  return (
    <main className="home-shell">
      <nav className="nav"><div className="brand-lockup"><span className="brand-mark">S</span><span className="brand">Sigma signal</span><span className="nav-label">策略信号仪表盘</span></div><span className="sync-indicator"><i />数据快照已就绪</span></nav>
      <section className="hero">
        <div className="hero-ambient" aria-hidden="true"><span className="formula-background formula-one">E(Rₚ) = ∑ wᵢE(Rᵢ)</span><span className="formula-background formula-two">S = (Rₚ − Rƒ) / σₚ</span><span className="formula-background formula-three">VaRα = μ − zασ</span><span className="formula-background formula-four">σₚ² = wᵀΣw</span><span className="formula-background formula-five">C = S₀N(d₁) − Ke⁻ʳᵀN(d₂)</span><span className="formula-background formula-six">P(A|B) = P(B|A)P(A) / P(B)</span><span className="ambient-orb orb-one" /><span className="ambient-orb orb-two" /><span className="scan-line" /></div>
        <div className="hero-copy"><div className="hero-kicker"><span className="eyebrow">SIGMA SIGNAL · STRATEGY INTELLIGENCE</span><span className="hero-status"><i />LIVE MONITORING</span></div><h1>让策略被看见，<br />让数据成为信号。</h1><p>以严谨数据观察策略，以清晰洞见穿越波动。Sigma signal，让每一条曲线都有迹可循。</p><div className="hero-highlights"><span><b>06</b> 精选策略</span><span><b>08:00</b> 每日更新</span></div></div>
        <div className="brand-visual" aria-hidden="true"><div className="sigma-halo halo-outer" /><div className="sigma-halo halo-inner" /><span className="sigma-axis axis-one" /><span className="sigma-axis axis-two" /><div className="sigma-emblem">Σ<small>SIGMA SIGNAL</small></div><span className="brand-coordinate coordinate-one">α / RETURN</span><span className="brand-coordinate coordinate-two">σ / RISK</span><span className="brand-coordinate coordinate-three">β / MARKET</span><span className="brand-manifesto">MEASURE · INTERPRET · EVOLVE</span></div>
      </section>
      <section className="signals-section" aria-labelledby="signals-title">
        <div className="section-heading"><div><span className="eyebrow">信号列表</span><h2 id="signals-title">已跟踪策略</h2></div><span className="count-pill">{String(signals.length).padStart(2, "0")} 个信号</span></div>
        <div className="signals-grid">{signals.map((signal) => <SignalCard key={signal.id} signal={signal} />)}</div>
      </section>
      <p className="disclaimer">仅作信息展示，不构成投资建议。历史表现不代表未来结果。</p>
    </main>
  );
}
