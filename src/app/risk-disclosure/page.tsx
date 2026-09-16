import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { LegalArticle } from "@/components/legal-article";

export const metadata: Metadata = {
  title: "风险披露 | Sigma Bot",
  description: "差价合约与自动交易的风险披露声明：杠杆风险、历史表现的局限性、AI 生成代码的注意事项。",
};

export default function RiskDisclosurePage() {
  return (
    <main className="platform-shell legal-shell">
      <SiteNav active="marketplace" />
      <LegalArticle
        code="LEGAL · RISK DISCLOSURE"
        title="风险披露"
        intro="杠杆交易与自动交易蕴含高风险，可能导致你损失全部本金。请在使用本平台任何策略、商品或工具前，仔细阅读以下风险披露。"
        updatedAt="2026-09"
      >
        <section id="trading">
          <h2>1. 交易风险</h2>
          <p>外汇、差价合约（CFD）及其他杠杆产品具有高度投机性，价格波动剧烈，可能造成超出初始保证金的损失。你不应投入无法承受损失的资金。</p>
        </section>
        <section id="performance">
          <h2>2. 历史表现的局限性</h2>
          <p>平台展示的策略增长曲线、胜率与统计数据均来自历史数据，不代表未来表现。任何回测结果与模拟账户结果都无法保证实盘收益。</p>
        </section>
        <section id="software">
          <h2>3. 软件与自动交易风险</h2>
          <ul>
            <li>EA / 指标源码需自行编译、审查与回测，平台不对代码质量、安全性或收益作任何保证；</li>
            <li>自动交易系统可能因网络中断、服务器故障、滑点或流动性缺失而无法按预期执行；</li>
            <li>请在模拟账户充分验证后，再考虑投入真实资金。</li>
          </ul>
        </section>
        <section id="ai">
          <h2>4. AI 生成内容的风险</h2>
          <p>AI 策略实验室生成的 MQL5 代码仅供学习与研究，可能包含逻辑错误或不适用于实盘环境。使用者需自行审查、测试并承担全部使用责任。</p>
        </section>
        <section id="observation">
          <h2>5. 观摩信息风险</h2>
          <p>观摩账号信息由用户自行提交，平台不验证其真实性。跟随、复制或据此交易产生的风险由使用者自行承担。请勿在任何场景下提交主账户密码。</p>
        </section>
        <section id="advice">
          <h2>6. 非投资建议</h2>
          <p>本平台所有内容仅用于技术与教育目的，不构成投资、法律或税务建议。如有需要，请咨询持牌专业人士。</p>
        </section>
      </LegalArticle>
      <SiteFooter notice="交易有风险，入市需谨慎。" />
    </main>
  );
}