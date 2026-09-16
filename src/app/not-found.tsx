import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";

export const metadata = {
  title: "页面未找到",
};

export default function NotFound() {
  return (
    <main className="platform-shell legal-shell">
      <SiteNav active="signals" />
      <div className="legal-article">
        <header>
          <span className="panel-code">SYSTEM · 404 NOT FOUND</span>
          <h1>404 · 页面未找到</h1>
          <p>你访问的页面不存在或已被移动。请从以下入口继续探索平台内容。</p>
        </header>
        <div className="legal-body article-content">
          <section>
            <h2>推荐入口</h2>
            <ul>
              <li>策略信号中心 — 查看实时监测的策略表现数据；</li>
              <li>EA / 指标商城 — 浏览并选购社区开发者上架的交易工具；</li>
              <li>量化交易教程 — 学习 MT4/MT5 与算法交易知识。</li>
            </ul>
            <p>
              <Link href="/" className="error-retry-button">返回首页</Link>
            </p>
          </section>
        </div>
      </div>
      <SiteFooter notice="如果你认为这是平台的错误，请通过官方渠道反馈。" />
    </main>
  );
}