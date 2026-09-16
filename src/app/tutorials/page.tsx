import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { TutorialCard } from "@/components/tutorial-card";
import { listPublishedTutorials } from "@/lib/tutorials";

export const metadata: Metadata = { title: "量化交易教程 | Sigma Bot", description: "MT5、MQL5、策略设计、风险管理与量化交易图文及视频教程。" };

export const dynamic = "force-dynamic";

export default function TutorialsPage() {
  const tutorials = listPublishedTutorials();
  const articles = tutorials.filter((tutorial) => tutorial.kind === "article");
  const videos = tutorials.filter((tutorial) => tutorial.kind === "video");
  return (
    <main className="platform-shell tutorials-shell">
      <SiteNav active="tutorials" />
      <header className="platform-hero tutorial-hero"><div><span className="panel-code">QUANT & MQL5 LEARNING CENTER</span><h1>策略开发教程</h1><p>从策略规则、风险模型到 MQL5 实现，建立可验证、可迭代的量化交易开发流程。</p></div><div className="tutorial-path"><span>01 · 策略设计</span><span>02 · 风险控制</span><span>03 · 编程实现</span><span>04 · 回测验证</span></div></header>
      <section className="tutorial-section"><header><div><span className="panel-code">GUIDES</span><h2>图文教程</h2></div><p>站内阅读 · 持续更新</p></header><div className="tutorial-grid">{articles.map((tutorial) => <TutorialCard key={tutorial.id} tutorial={tutorial} />)}</div></section>
      <section className="tutorial-section"><header><div><span className="panel-code">EXTERNAL VIDEO</span><h2>视频学习资源</h2></div><p>跳转至第三方平台播放</p></header><div className="tutorial-grid">{videos.map((tutorial) => <TutorialCard key={tutorial.id} tutorial={tutorial} />)}</div></section>
      <SiteFooter notice="外部视频归相应平台及创作者所有；链接仅用于帮助用户发现公开学习资源。" />
    </main>
  );
}
