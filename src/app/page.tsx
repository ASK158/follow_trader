import type { Metadata } from "next";
import Link from "next/link";
import { QuantVisualCanvas } from "@/components/quant-visual-canvas";
import { ServicesMatrix } from "@/components/services-matrix";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { TypewriterTitle } from "@/components/typewriter-title";

export const metadata: Metadata = {
  title: "Sigma Bot | MT4/MT5 智能交易技术平台",
  description: "面向 MT4/MT5 交易者与开发者，连接策略发现、交易验证、工具交易与 AI 策略开发。",
};

// 核心功能板块（突出关键词与核心能力）
const coreServices = [
  {
    index: "01",
    title: "策略信号中心",
    en: "SIGNAL DISCOVERY",
    keywords: ["持续监测", "收益回撤曲线", "多源聚合"],
    description: "策略信号中心。追踪全球可靠策略信号，提供清晰透明的绩效数据。",
  },
  {
    index: "02",
    title: "交易工具商城",
    en: "TOOL MARKETPLACE",
    keywords: ["MT4/MT5 EA", "量化技术指标", "风控辅助脚本"],
    description: "交易工具市场。发现更多的交易工具，分享更多的交易工具——Sigma共享社区。",
  },
  {
    index: "03",
    title: "观摩空间",
    en: "LIVE OBSERVATION",
    keywords: ["实盘环境", "穿透式记录", "可信账户流"],
    description: "通过不间断运行的真实或模拟账户，展示不可篡改的交易细节与运行表现，打造可验证的信任基石。",
  },
  {
    index: "04",
    title: "AI 实验室",
    en: "AI STRATEGY LAB",
    keywords: ["自然语言对话", "MQL5 自动生成", "大模型驱动"],
    description: "只需用自然语言描述交易思路，即可快速生成、调试与编译标准 MQL4/MQL5 策略代码，降低量化门槛。",
  },
];

const quickLinks = [
  { label: "信号中心", href: "/signals" },
  { label: "EA社区商城", href: "/marketplace" },
  { label: "观摩空间", href: "/observation" },
  { label: "AI实验室", href: "/agent" },
];

// 五类服务人群定位
const audiences = [
  { code: "01", title: "普通新手", need: "简单使用 · 降低选择成本" },
  { code: "02", title: "进阶交易者", need: "引入工具 · 优化交易流程" },
  { code: "03", title: "策略研究者", need: "验证与展示策略真实表现" },
  { code: "04", title: "零代码创作者", need: "将想法快速变为量化程序" },
  { code: "05", title: "个人开发者 / 团队", need: "品牌树立 · 产品展示与流通" },
];

// 三大生态分类独立呈现
const ecosystems = [
  {
    id: "cloud",
    title: "云服务生态",
    en: "CLOUD INFRASTRUCTURE",
    brands: [
      { name: "AWS", mark: "aws", slug: "aws" },
      { name: "Microsoft Azure", mark: "A", slug: "azure" },
      { name: "Google Cloud", mark: "G", slug: "google" },
      { name: "Cloudflare", mark: "☁", slug: "cloudflare" },
      { name: "Alibaba Cloud", mark: "Ali", slug: "alibaba" },
    ],
  },
  {
    id: "trading",
    title: "交易服务生态",
    en: "TRADING & BROKERAGE",
    brands: [
      { name: "IC Markets", mark: "IC", slug: "ic" },
      { name: "LMAX", mark: "LMAX", slug: "lmax" },
      { name: "Swissquote", mark: "SQ", slug: "swissquote" },
      { name: "Exness", mark: "ex", slug: "exness" },
      { name: "OANDA", mark: "O", slug: "oanda" },
    ],
  },
  {
    id: "ai",
    title: "AI 技术生态",
    en: "AI & INTELLIGENCE",
    brands: [
      { name: "OpenAI", mark: "◎", slug: "openai" },
      { name: "Anthropic", mark: "AI", slug: "anthropic" },
      { name: "Google Gemini", mark: "✦", slug: "gemini" },
      { name: "GLM", mark: "GLM", slug: "glm" },
    ],
  },
];

function BrandColorDivider() {
  return (
    <div className="brand-color-divider" aria-hidden="true">
      <span className="color-orbit color-orbit-one" />
      <span className="color-orbit color-orbit-two" />
      <span className="color-grid" />
      <span className="color-glow" />
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="brand-home-shell">
      <div className="brand-home-sheet">
        <SiteNav active="home" />

        {/* 1. Hero 区域：品牌文案与聚散离散图并列呈现 */}
        <section className="brand-hero-minimal" aria-labelledby="brand-hero-title">
          <div className="brand-hero-content">
            <div className="brand-hero-copy">
              <div className="brand-hero-tag">
                <span className="tag-line" />
                <span>TECHNOLOGY × AI × COMMUNITY</span>
              </div>

              <h1 id="brand-hero-title" className="brand-typewriter-statement">
                <TypewriterTitle
                  lines={[
                    "SIGMA\u00A0 BOT",
                    "发现优质信号，善用多元工具，构建智能策略",
                    "——赋能每一次交易决策。",
                  ]}
                />
              </h1>

              <p className="brand-platform-position">
                面向 MT4/MT5 交易者与开发者，集策略发现、交易验证、工具交易和 AI 策略开发于一体的开放平台。
              </p>

              <nav className="brand-quick-links" aria-label="核心功能导航">
                {quickLinks.map((item, idx) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`btn-brand-primary ${idx === 0 ? "btn-brand-lead" : "btn-brand-ghost"}`}
                  >
                    {item.label} <span>→</span>
                  </Link>
                ))}
              </nav>
            </div>

            <div className="brand-hero-canvas-wrap" aria-hidden="true">
              <QuantVisualCanvas />
            </div>
          </div>
        </section>

        <BrandColorDivider />

        {/* 2. 四大核心功能板块（突出关键词） */}
        <section className="brand-services-minimal" aria-labelledby="core-services-title">
          <header className="brand-block-header">
            <div>
              <span className="sub-tag">CORE CAPABILITIES / 核心服务</span>
              <h2 id="core-services-title">四大核心功能矩阵</h2>
            </div>
            <p>覆盖从信号发现、真实验证、工具应用到智能构建的完整交易生命周期。</p>
          </header>

          {/* 点击卡片展开描述性文本（单卡激活的手风琴矩阵） */}
          <ServicesMatrix services={coreServices} />
        </section>

        {/* 3. 服务五类人群定位（简约网格） */}
        <section className="brand-audiences-minimal" aria-labelledby="audiences-title">
          <div className="audiences-intro-pane">
            <span className="sub-tag">AUDIENCE ORIENTED / 用户定位</span>
            <h2 id="audiences-title">赋能每一种<br />交易创造力</h2>
            <p>无论你是交易新手、资深操盘手还是策略开发者，都能在 Sigma Bot 找到对应的价值落地路径。</p>
          </div>

          <div className="audiences-list-pane">
            {audiences.map((aud) => (
              <div key={aud.code} className="audience-box">
                <span className="aud-code">{aud.code}</span>
                <h4>{aud.title}</h4>
                <p>{aud.need}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 4. 三大生态分类独立呈现 */}
        <section className="brand-ecosystems-section" aria-labelledby="ecosystems-title">
          <header className="brand-block-header">
            <div>
              <span className="sub-tag">TECHNOLOGY & PARTNERS / 生态网络</span>
              <h2 id="ecosystems-title">来自强大的生态支持</h2>
            </div>
          </header>

          <div className="ecosystem-matrix">
            {ecosystems.map((eco) => (
              <article key={eco.id} className="ecosystem-row" id={`ecosystem-${eco.id}`}>
                <div className="ecosystem-row-label">
                  <span className={`ecosystem-icon ecosystem-icon-${eco.id}`} aria-hidden="true" />
                  <div>
                    <h3>{eco.title}</h3>
                    <small>{eco.en}</small>
                  </div>
                </div>
                <div className="ecosystem-brand-list">
                  {eco.brands.map((brand) => (
                    <div key={brand.name} className={`ecosystem-brand ecosystem-brand-${brand.slug}`}>
                      <span className="ecosystem-brand-mark" aria-hidden="true">{brand.mark}</span>
                      <span>{brand.name}</span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <SiteFooter notice="Sigma Bot 提供量化技术工具与信息服务，不构成任何投资建议。自动交易存在市场风险，请在充分理解后审慎决策。" />
      </div>
    </main>
  );
}
