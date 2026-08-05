import { SignalCard } from "@/components/signal-card";
import { getSignals } from "@/lib/signal-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const signals = await getSignals();

  return (
    <main className="home-shell">
      <nav className="nav"><div className="brand-lockup"><span className="brand-mark">S</span><span className="brand">Signal Watch</span><span className="nav-label">策略信号仪表盘</span></div><span className="sync-indicator"><i />数据快照已就绪</span></nav>
      <section className="hero">
        <div className="hero-copy"><span className="eyebrow">STRATEGY INTELLIGENCE</span><h1>用清晰的曲线，<br />追踪策略表现。</h1><p>聚合公开策略信号的收益、资金与交易概览。数据源不可用时，自动显示可追溯的本地快照。</p></div>
        <div className="hero-orbit" aria-hidden="true"><span className="orbit-ring ring-one" /><span className="orbit-ring ring-two" /><span className="orbit-core">06<small>策略</small></span><span className="orbit-label">LIVE<br />MONITORING</span></div>
      </section>
      <section className="signals-section" aria-labelledby="signals-title">
        <div className="section-heading"><div><span className="eyebrow">信号列表</span><h2 id="signals-title">已跟踪策略</h2></div><span className="count-pill">{String(signals.length).padStart(2, "0")} 个信号</span></div>
        <div className="signals-grid">{signals.map((signal) => <SignalCard key={signal.id} signal={signal} />)}</div>
      </section>
      <p className="disclaimer">仅作信息展示，不构成投资建议。历史表现不代表未来结果。</p>
    </main>
  );
}
