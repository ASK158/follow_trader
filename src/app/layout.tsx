import type { Metadata } from "next";
import "./globals.css";
import "./mobile-enhance.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Sigma Bot | 量化交易技术平台",
    template: "%s | Sigma Bot",
  },
  description: "策略信号监测、MT4/MT5 交易工具、AI 策略开发与量化交易教程。",
  keywords: ["量化交易", "MT4", "MT5", "EA", "策略信号", "算法交易", "MQL5"],
  openGraph: {
    type: "website",
    siteName: "Sigma Bot",
    title: "Sigma Bot | 量化交易技术平台",
    description: "策略信号监测、MT4/MT5 交易工具、AI 策略开发与量化交易教程。",
    url: "/",
  },
  robots: { index: true, follow: true },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#b94555" },
    { media: "(prefers-color-scheme: dark)", color: "#141210" },
  ],
};

const themeScript = `(function(){try{var m=localStorage.getItem("sigma-theme");if(m!=="light"&&m!=="dark")m=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";var d=m==="dark";var r=document.documentElement;r.dataset.theme=d?"dark":"light";r.dataset.themeMode=m;r.style.colorScheme=d?"dark":"light"}catch(e){}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" data-theme="light" data-theme-mode="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}