"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("Runtime error:", error);
  }, [error]);

  return (
    <main className="platform-shell legal-shell">
      <nav className="site-nav" aria-label="主功能导航">
        <Link href="/" className="site-brand" aria-label="Sigma Bot 首页">
          <span>Σ</span><b>SIGMA BOT</b>
        </Link>
      </nav>
      <div className="legal-article">
        <header>
          <span className="panel-code">SYSTEM · RUNTIME ERROR</span>
          <h1>500 · 服务暂时不可用</h1>
          <p>页面加载时发生错误。请稍后重试，或返回首页继续浏览平台内容。</p>
          <small>错误标识：{error.digest ?? "UNKNOWN"}</small>
        </header>
        <div className="legal-body article-content">
          <section>
            <h2>你可以尝试</h2>
            <ul>
              <li>点击下方按钮重新加载当前页面；</li>
              <li>返回首页，从策略信号中心重新进入相关功能；</li>
              <li>如果问题持续存在，请通过官方渠道反馈错误标识。</li>
            </ul>
            <p className="error-actions">
              <button type="button" onClick={retry} className="error-retry-button">重试</button>
              <Link href="/" className="error-retry-button error-home-link">返回首页</Link>
            </p>
          </section>
        </div>
      </div>
      <footer className="site-footer">
        <div className="site-footer-legal">
          <span>© Sigma Bot</span>
          <span className="site-footer-legal-links">
            <Link href="/privacy">隐私政策</Link>
            <i aria-hidden="true">·</i>
            <Link href="/terms">服务条款</Link>
            <i aria-hidden="true">·</i>
            <Link href="/risk-disclosure">风险披露</Link>
          </span>
        </div>
      </footer>
    </main>
  );
}