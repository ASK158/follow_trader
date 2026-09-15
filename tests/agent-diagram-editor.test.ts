import assert from "node:assert/strict";
import test from "node:test";
import { buildStrategyDiagram } from "../src/lib/agent/diagram";
import { inspectStrategyRisk } from "../src/lib/agent/risk-check";
import { expectedMql5EntryPoint, formatStrategySpecError, parseStrategySpec, strategySpecSchema, type StrategySpec } from "../src/lib/agent/types";

const baseSpec: StrategySpec = {
  programType: "expert-advisor",
  name: "EMA crossover",
  summary: "EMA crossover strategy",
  symbol: "EURUSD",
  timeframe: "H1",
  strategyType: "trend",
  indicators: [
    { id: "ema-fast", name: "EMA20", parameters: { period: 20 } },
    { id: "ema-slow", name: "EMA50", parameters: { period: 50 } },
  ],
  entryRules: [{ side: "long", conditions: ["EMA20 上穿 EMA50"] }],
  exitRules: ["EMA20 下穿 EMA50"],
  risk: {
    sizingMethod: "按止损距离和净值风险计算",
    riskPerTradePercent: 1,
    stopLoss: "ATR 1.5 倍",
    takeProfit: "风险回报比 2:1",
    maxPositions: 1,
    protections: ["点差过滤"],
  },
  assumptions: [],
};

test("阶段式逻辑图使用稳定指标 ID 并为可编辑节点绑定规格", () => {
  const diagram = buildStrategyDiagram(baseSpec);
  const fast = diagram.nodes.find((node) => node.id === "indicator-ema-fast");
  const entry = diagram.nodes.find((node) => node.binding?.kind === "entry");

  assert.equal(fast?.binding?.kind, "indicator");
  assert.equal(fast?.editable, true);
  assert.equal(entry?.stage, "entry");
  assert.ok(diagram.edges.some((edge) => edge.source === "indicator-ema-fast" && edge.target === entry?.id));
  assert.ok(diagram.edges.some((edge) => edge.source === "indicator-ema-slow" && edge.target === entry?.id));
});

test("StrategySpec 兼容旧条件数组并接受三层嵌套条件组", () => {
  assert.equal(strategySpecSchema.safeParse(baseSpec).success, true);
  const nested = structuredClone(baseSpec);
  nested.entryRules[0].conditionTree = {
    id: "root",
    kind: "group",
    operator: "and",
    children: [{
      id: "nested",
      kind: "group",
      operator: "or",
      children: [
        { id: "rsi-low", kind: "condition", expression: "RSI < 30" },
        { id: "close-high", kind: "condition", expression: "收盘价 > EMA200" },
      ],
    }],
  };
  assert.equal(strategySpecSchema.safeParse(nested).success, true);
});

test("旧规格默认按 EA 解析，并拒绝 maxPositions=0", () => {
  const { programType, ...legacySpec } = baseSpec;
  assert.equal(programType, "expert-advisor");
  assert.equal(parseStrategySpec(legacySpec).programType, "expert-advisor");
  const invalid = strategySpecSchema.safeParse({ ...legacySpec, risk: { ...legacySpec.risk, maxPositions: 0 } });
  assert.equal(invalid.success, false);
  if (!invalid.success) {
    assert.match(formatStrategySpecError(invalid.error), /risk\.maxPositions/);
    assert.match(formatStrategySpecError(invalid.error), /1 到 100/);
  }
});

test("自定义指标允许零持仓并使用 OnCalculate 与指标输出图", () => {
  const indicator = parseStrategySpec({
    programType: "custom-indicator",
    name: "RSI Divergence",
    summary: "在副图绘制 RSI 背离信号",
    symbol: "CURRENT",
    timeframe: "CURRENT",
    strategyType: "自定义指标",
    indicators: [{ id: "rsi", name: "RSI", parameters: { period: 14 } }],
    assumptions: ["只提示信号，不执行交易"],
  });
  assert.equal(indicator.risk.maxPositions, 0);
  assert.deepEqual(indicator.entryRules, []);
  assert.deepEqual(indicator.exitRules, []);
  assert.equal(expectedMql5EntryPoint(indicator), "OnCalculate");

  const diagram = buildStrategyDiagram(indicator);
  assert.ok(diagram.nodes.some((node) => node.id === "indicator-calculate"));
  assert.ok(diagram.nodes.some((node) => node.id === "indicator-output"));
  assert.equal(diagram.nodes.some((node) => node.id === "risk" || node.id.startsWith("open-")), false);

  const code = "#property indicator_separate_window\nint OnInit(){return INIT_SUCCEEDED;}\nint OnCalculate(const int rates_total,const int prev_calculated,const datetime &time[],const double &open[],const double &high[],const double &low[],const double &close[],const long &tick_volume[],const long &volume[],const int &spread[]){return rates_total;}";
  const findings = inspectStrategyRisk(indicator, code);
  assert.equal(findings.some((finding) => finding.id === "missing-entry-point"), false);
  assert.equal(inspectStrategyRisk(indicator, `${code}\nCTrade trade;`).some((finding) => finding.id === "indicator-trading-call"), true);
});

test("旧模型输出的指标规格可由名称识别，maxPositions=0 不再触发 too_small", () => {
  const { programType: _removed, ...legacyIndicator } = {
    ...baseSpec,
    programType: "custom-indicator" as const,
    name: "RSI 自定义指标",
    strategyType: "技术指标",
    entryRules: [],
    exitRules: [],
    risk: { ...baseSpec.risk, riskPerTradePercent: 0, maxPositions: 0 },
  };
  assert.equal(_removed, "custom-indicator");
  const parsed = strategySpecSchema.safeParse(legacyIndicator);
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.programType, "custom-indicator");
});

test("指标规格会清除模型残留的 EA 条件树与交易风险字段", () => {
  const indicator = parseStrategySpec({
    ...baseSpec,
    programType: "custom-indicator",
    name: "头肩顶形态识别指标",
    strategyType: "自定义指标",
    entryRules: [{ side: "short", conditions: ["检测到头肩顶"] }],
    exitRules: ["形态失效"],
    exitConditionTree: {},
    risk: { ...baseSpec.risk, riskPerTradePercent: 1, maxPositions: 1 },
  });

  assert.deepEqual(indicator.entryRules, []);
  assert.deepEqual(indicator.exitRules, []);
  assert.equal(indicator.exitConditionTree, undefined);
  assert.equal(indicator.risk.riskPerTradePercent, 0);
  assert.equal(indicator.risk.maxPositions, 0);
  assert.equal(indicator.risk.sizingMethod, "不适用（指标不执行交易）");
});
