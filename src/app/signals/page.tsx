import type { Metadata } from "next";
import Link from "next/link";
import { LiveSignalsBoard } from "@/components/live-signals-board";
import { SignalCard } from "@/components/signal-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { QuantVisualCanvas } from "@/components/quant-visual-canvas";
import { getSignals } from "@/lib/signal-data";
import { listSignals, staleWindowMs } from "@/lib/sigmac/relay-store";

export const metadata: Metadata = {
  title: "策略信号中心",
  description: "浏览经过持续监测的 MT4/MT5 策略信号、收益曲线与风险指标，并查看由发布器直连推送的实时信号。",
};

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ tab?: string }> };

export default async function SignalsPage({ searchParams }: Props) {
  const { tab } = await searchParams;
  const live = tab === "live";
  const signals = live ? [] : await getSignals();
  const liveSignals = live ? listSignals() : [];

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

        <nav className="signals-tab-nav" aria-label="信号分类">
          <Link href="/signals" className={live ? "" : "active"}>观摩信号</Link>
          <Link href="/signals?tab=live" className={live ? "active" : ""}>实时信号</Link>
        </nav>

        {live ? (
          <section className="signals-section" aria-labelledby="live-signals-title">
            <div className="section-heading">
              <div><span className="editorial-label">实时数据 · LIVE FEED</span><h2 id="live-signals-title">实时信号</h2></div>
              <span className="count-pill">{String(liveSignals.length).padStart(2, "0")} 个信号 · LIVE</span>
            </div>
            <LiveSignalsBoard initialSignals={liveSignals} staleSeconds={Math.round(staleWindowMs() / 1000)} />
          </section>
        ) : (
          <section className="signals-section" aria-labelledby="signals-title">
            <div className="section-heading">
              <div><span className="editorial-label">公开数据 · WATCH LIST</span><h2 id="signals-title">观摩信号</h2></div>
              <span className="count-pill">{String(signals.length).padStart(2, "0")} 个策略 · SIGNALS</span>
            </div>
            <div className="signals-grid">{signals.map((signal, index) => <SignalCard key={signal.id} signal={signal} index={index + 1} />)}</div>
          </section>
        )}

        <SiteFooter notice="仅作信息展示，不构成投资建议。历史表现不代表未来结果。" />
      </div>
    </main>
  );
}
