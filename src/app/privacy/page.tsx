import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { LegalArticle } from "@/components/legal-article";

export const metadata: Metadata = {
  title: "隐私政策 | Sigma Bot",
  description: "了解 Sigma Bot 如何收集、使用与保护你的账户信息、交易数据与个人隐私。",
};

export default function PrivacyPage() {
  return (
    <main className="platform-shell legal-shell">
      <SiteNav active="marketplace" />
      <LegalArticle
        code="LEGAL · PRIVACY POLICY"
        title="隐私政策"
        intro="本政策说明 Sigma Bot（下称「本平台」）在你使用信号监测、商城交易、观摩空间与教程服务时，如何收集、使用、存储与保护你的个人信息。"
        updatedAt="2026-09"
      >
        <section id="scope">
          <h2>1. 适用范围</h2>
          <p>本政策适用于本平台全部页面、API 接口与账户功能，包括策略信号中心、EA / 指标商城、AI 策略实验室、观摩空间与量化教程板块。</p>
        </section>
        <section id="collection">
          <h2>2. 我们收集的信息</h2>
          <p>账户信息：注册时提交的用户名、邮箱地址与密码哈希；账户安全相关日志（登录时间、IP 等）。</p>
          <p>交易与服务数据：订单记录、收藏、评论、观摩账号提交内容、AI 实验室使用记录。</p>
          <p>技术数据：浏览器类型、访问页面等基本统计信息，用于服务稳定与安全审计。</p>
        </section>
        <section id="usage">
          <h2>3. 信息的使用</h2>
          <ul>
            <li>提供并维护账户、订单交付与商品下载功能；</li>
            <li>展示策略信号、生成统计与改进页面体验；</li>
            <li>防范滥用、欺诈与未授权访问；</li>
            <li>在你明确订阅后发送服务通知（如订单与审核结果）。</li>
          </ul>
        </section>
        <section id="sharing">
          <h2>4. 信息的共享</h2>
          <p>本平台不会出售你的个人信息。除以下情形外，不会向第三方提供你的数据：经你同意；法律法规要求；保护平台与用户合法权益所必需。</p>
        </section>
        <section id="storage">
          <h2>5. 存储与保护</h2>
          <p>数据存储于平台服务器，访问权限仅限必要的管理人员。密码以哈希形式保存，传输过程使用 HTTPS 加密。我们将采取合理的技术与管理措施防止数据泄露、篡改或丢失。</p>
        </section>
        <section id="rights">
          <h2>6. 你的权利</h2>
          <p>你可以随时查询、更正账户资料；如需注销账户或删除个人信息，可通过平台公示的联系方式提出，我们将在合理期限内处理。</p>
        </section>
        <section id="changes">
          <h2>7. 政策更新</h2>
          <p>本政策如有重大变更，将在本页公布并更新日期。继续使用本平台即表示你接受更新后的政策。</p>
        </section>
      </LegalArticle>
      <SiteFooter notice="如有隐私相关问题，请通过平台公示的官方渠道联系我们。" />
    </main>
  );
}