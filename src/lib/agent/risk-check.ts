import type { RiskFinding, StrategySpec } from "./types";

export function inspectStrategyRisk(spec: StrategySpec, code: string): RiskFinding[] {
  const findings: RiskFinding[] = [];

  const add = (finding: RiskFinding) => findings.push(finding);

  if (spec.risk.riskPerTradePercent > 5) {
    add({ id: "high-risk-percent", severity: "high", title: "单笔风险过高", detail: `当前设置为 ${spec.risk.riskPerTradePercent}%，建议将单笔风险控制在账户净值的 1%–2%。` });
  } else if (spec.risk.riskPerTradePercent > 2) {
    add({ id: "medium-risk-percent", severity: "medium", title: "单笔风险偏高", detail: `当前设置为 ${spec.risk.riskPerTradePercent}%，需要结合最大连续亏损评估。` });
  }

  if (!/stop|sl|止损/i.test(`${spec.risk.stopLoss}\n${code}`) || /无|none|不设置/i.test(spec.risk.stopLoss)) {
    add({ id: "missing-stop", severity: "high", title: "缺少明确止损", detail: "策略必须包含可执行的初始止损和异常行情退出机制。" });
  }
  if (spec.risk.maxPositions > 5) {
    add({ id: "position-count", severity: "medium", title: "并发持仓较多", detail: `最多 ${spec.risk.maxPositions} 个持仓可能放大相关性风险。` });
  }
  if (/\bWebRequest\b|#import|\.dll\b/i.test(code)) {
    add({ id: "external-access", severity: "high", title: "检测到外部访问能力", detail: "代码包含网络请求或 DLL 导入，下载和编译前必须人工审查。" });
  }
  if (!/OnTick\s*\(/.test(code)) {
    add({ id: "missing-ontick", severity: "medium", title: "未检测到 OnTick", detail: "该文件可能不是完整 EA，或采用了其他事件入口，请确认生成目标。" });
  }
  if (!findings.length) {
    add({ id: "baseline", severity: "info", title: "未发现明显高风险模式", detail: "静态规则检查不等于编译、回测或实盘安全验证。" });
  }
  return findings;
}