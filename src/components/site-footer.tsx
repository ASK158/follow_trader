import Link from "next/link";
import { connection } from "next/server";
import { ThemeToggle } from "@/components/theme-toggle";
import { getPlatformSettings } from "@/lib/platform-settings";

type FooterColumn = { title: string; links: Array<{ href: string; label: string }> };

const columns: FooterColumn[] = [
  {
    title: "产品服务",
    links: [
      { href: "/signals", label: "策略信号中心" },
      { href: "/marketplace", label: "EA / 指标商城" },
      { href: "/agent", label: "AI 策略实验室" },
      { href: "/observation", label: "观摩空间" },
    ],
  },
  {
    title: "学习资源",
    links: [
      { href: "/tutorials", label: "量化交易教程" },
      { href: "/tutorials?type=article", label: "图文教程" },
      { href: "/tutorials?type=video", label: "视频教程" },
    ],
  },
  {
    title: "支持与条款",
    links: [
      { href: "/privacy", label: "隐私政策" },
      { href: "/terms", label: "服务条款" },
      { href: "/risk-disclosure", label: "风险披露" },
    ],
  },
];

const socialNetworks = [
  { key: "telegramUrl", label: "Telegram" },
  { key: "wechatOfficialAccountUrl", label: "微信公众号" },
  { key: "youtubeUrl", label: "YouTube" },
  { key: "bilibiliUrl", label: "Bilibili" },
] as const;

export async function SiteFooter({ notice }: { notice?: string }) {
  await connection();
  const settings = getPlatformSettings();
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="site-footer-columns">
        {columns.map((column) => (
          <nav key={column.title} className="site-footer-col" aria-label={column.title}>
            <b>{column.title}</b>
            <ul>
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <nav className="site-footer-col" aria-label="社交媒体">
          <b>社交媒体</b>
          <ul>
            {socialNetworks.map((network) => settings[network.key] ? (
              <li key={network.key}><a href={settings[network.key]} target="_blank" rel="noopener noreferrer">{network.label}</a></li>
            ) : <li key={network.key}><span>{network.label}（待配置）</span></li>)}
          </ul>
        </nav>
      </div>
      {notice ? <p className="site-footer-notice">{notice}</p> : null}
      <div className="site-footer-legal">
        <span>© {year} Sigma Bot · 保留所有权利</span>
        <span className="site-footer-legal-links">
          <Link href="/privacy">隐私政策</Link>
          <i aria-hidden="true">·</i>
          <Link href="/terms">服务条款</Link>
          <i aria-hidden="true">·</i>
          <Link href="/risk-disclosure">风险披露</Link>
        </span>
        <span className="site-footer-theme"><span>界面主题</span><ThemeToggle /></span>
      </div>
    </footer>
  );
}