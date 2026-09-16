import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { LegalArticle } from "@/components/legal-article";

export const metadata: Metadata = {
  title: "服务条款 | Sigma Bot",
  description: "Sigma Bot 平台服务条款：账户规则、商城交易、内容规范与免责声明。",
};

export default function TermsPage() {
  return (
    <main className="platform-shell legal-shell">
      <SiteNav active="marketplace" />
      <LegalArticle
        code="LEGAL · TERMS OF SERVICE"
        title="服务条款"
        intro="本条款是你与 Sigma Bot（下称「本平台」）之间就使用策略信号中心、EA / 指标商城、AI 策略实验室、观摩空间与教程等服务所达成的协议。"
        updatedAt="2026-09"
      >
        <section id="acceptance">
          <h2>1. 条款接受</h2>
          <p>注册账户或使用本平台任一功能，即表示你已阅读、理解并同意本条款及《隐私政策》。若不同意，请停止使用本平台。</p>
        </section>
        <section id="account">
          <h2>2. 账户规则</h2>
          <p>你需提供真实、准确的注册信息，并妥善保管账户凭证。账户下的操作均视为你本人行为。发现未授权使用应立即通知平台。</p>
        </section>
        <section id="marketplace">
          <h2>3. 商城与数字商品</h2>
          <ul>
            <li>商品由开发者提交，经平台审核信息完整性与合规性后上架；</li>
            <li>购买成功后凭订单可重新下载交付的源码文件；</li>
            <li>数字商品一经下载，除内容与描述严重不符外，原则上不支持退款；</li>
            <li>开发者需保证拥有所提交源码的完整权利，否则由此产生的责任由开发者承担。</li>
          </ul>
        </section>
        <section id="content">
          <h2>4. 内容规范</h2>
          <p>你承诺不利用本平台发布违法、侵权、欺诈内容，不提交他人主账户密码，不进行恶意爬取、攻击或干扰平台服务。违反者平台有权下架内容、限制或终止账户。</p>
        </section>
        <section id="ip">
          <h2>5. 知识产权</h2>
          <p>平台界面、标识与原创内容归本平台所有。开发者提交的商品源码权利归属由开发者与购买者之间的交易约定，平台仅提供交易与交付服务。</p>
        </section>
        <section id="disclaimer">
          <h2>6. 免责声明</h2>
          <p>本平台展示的策略信号、统计数据与观摩信息仅供参考，不构成任何投资建议或收益承诺。你应自行判断并承担交易决策的全部责任。</p>
        </section>
        <section id="changes">
          <h2>7. 条款变更</h2>
          <p>本平台可不时修订本条款，修订后将在本页公布。继续使用服务即视为接受修订后的条款。</p>
        </section>
      </LegalArticle>
      <SiteFooter notice="如有条款相关问题，请通过平台公示的官方渠道联系我们。" />
    </main>
  );
}