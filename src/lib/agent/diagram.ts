import type { DiagramEdge, DiagramNode, StrategyDiagram, StrategySpec } from "./types";

export function buildStrategyDiagram(spec: StrategySpec): StrategyDiagram {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const addNode = (node: Omit<DiagramNode, "x" | "y">, x: number, y: number) => nodes.push({ ...node, x, y });
  const connect = (source: string, target: string, label?: string) => {
    edges.push({ id: `${source}-${target}`, source, target, label });
  };

  addNode({ id: "start", type: "start", stage: "trigger", editable: true, binding: { kind: "environment" }, label: `${spec.symbol} · ${spec.timeframe}`, detail: "行情触发与运行环境" }, 20, 180);

  spec.indicators.forEach((indicator, index) => {
    const id = `indicator-${indicator.id}`;
    addNode({ id, type: "indicator", stage: "data", editable: true, binding: { kind: "indicator", index }, label: indicator.name, detail: Object.entries(indicator.parameters).slice(0, 3).map(([key, value]) => `${key}=${value}`).join(" · ") || "计算指标" }, 300, 40 + index * 116);
    connect("start", id);
  });

  if (spec.programType === "custom-indicator") {
    const centerY = Math.max(150, ((spec.indicators.length - 1) * 116) / 2 + 40);
    addNode({ id: "indicator-calculate", type: "action", stage: "entry", editable: false, binding: { kind: "result" }, label: "OnCalculate 指标计算", detail: spec.strategyType }, 650, centerY);
    if (spec.indicators.length) spec.indicators.forEach((indicator) => connect(`indicator-${indicator.id}`, "indicator-calculate"));
    else connect("start", "indicator-calculate");
    addNode({ id: "indicator-output", type: "end", stage: "exit", editable: false, binding: { kind: "result" }, label: "更新缓冲区与图表", detail: spec.summary }, 1020, centerY);
    connect("indicator-calculate", "indicator-output", "每次重算");
    return { nodes, edges };
  }

  spec.entryRules.forEach((rule, index) => {
    const stableId = rule.id || `${rule.side}-${index}`;
    const decisionId = `entry-${stableId}`;
    const actionId = `open-${stableId}`;
    const summary = rule.conditionTree?.kind === "group"
      ? `${rule.conditionTree.children.length} 项 · ${rule.conditionTree.operator === "and" ? "全部满足" : "任一满足"}`
      : rule.conditions.slice(0, 2).join(" 且 ");
    const branchY = 70 + index * 190;
    addNode({ id: decisionId, type: "decision", stage: "entry", editable: true, binding: { kind: "entry", index }, label: `${rule.side === "long" ? "做多" : rule.side === "short" ? "做空" : "双向"}条件`, detail: summary }, 600, branchY);
    addNode({ id: actionId, type: "action", stage: "execution", editable: true, binding: { kind: "execution", index }, label: "计算仓位并开仓", detail: spec.risk.sizingMethod }, 900, branchY);
    if (spec.indicators.length) spec.indicators.forEach((indicator) => connect(`indicator-${indicator.id}`, decisionId));
    else connect("start", decisionId);
    connect(decisionId, actionId, "满足");
  });

  const centerY = Math.max(150, ((spec.entryRules.length - 1) * 190) / 2 + 70);
  addNode({ id: "risk", type: "risk", stage: "risk", editable: true, binding: { kind: "risk" }, label: "持续风控", detail: `风险 ${spec.risk.riskPerTradePercent}% · 最多 ${spec.risk.maxPositions} 仓` }, 1200, centerY);
  spec.entryRules.forEach((rule, index) => connect(`open-${rule.id || `${rule.side}-${index}`}`, "risk"));
  const exitSummary = spec.exitConditionTree?.kind === "group"
    ? `${spec.exitConditionTree.children.length} 项 · ${spec.exitConditionTree.operator === "and" ? "全部满足" : "任一满足"}`
    : spec.exitRules.slice(0, 2).join(" 或 ");
  addNode({ id: "exit", type: "decision", stage: "exit", editable: true, binding: { kind: "exit" }, label: "检查离场条件", detail: exitSummary }, 1500, centerY);
  connect("risk", "exit");
  addNode({ id: "end", type: "end", stage: "exit", editable: false, binding: { kind: "result" }, label: "平仓并记录", detail: spec.risk.takeProfit }, 1800, centerY);
  connect("exit", "end", "满足");
  connect("exit", "risk", "继续持有");

  return { nodes, edges };
}