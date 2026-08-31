import type { DiagramEdge, DiagramNode, StrategyDiagram, StrategySpec } from "./types";

export function buildStrategyDiagram(spec: StrategySpec): StrategyDiagram {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  let y = 20;

  const addNode = (node: Omit<DiagramNode, "x" | "y">, x = 260) => {
    nodes.push({ ...node, x, y });
    y += 120;
  };
  const connect = (source: string, target: string, label?: string) => {
    edges.push({ id: `${source}-${target}`, source, target, label });
  };

  addNode({ id: "start", type: "start", label: `${spec.symbol} · ${spec.timeframe}`, detail: "新行情触发" });

  spec.indicators.forEach((indicator, index) => {
    const id = `indicator-${index}`;
    addNode({ id, type: "indicator", label: indicator.name, detail: Object.entries(indicator.parameters).map(([key, value]) => `${key}=${value}`).join(" · ") || "计算指标" });
    connect(index === 0 ? "start" : `indicator-${index - 1}`, id);
  });

  const decisionSource = spec.indicators.length ? `indicator-${spec.indicators.length - 1}` : "start";
  spec.entryRules.forEach((rule, index) => {
    const decisionId = `entry-${index}`;
    const actionId = `open-${index}`;
    addNode({ id: decisionId, type: "decision", label: `${rule.side === "long" ? "做多" : rule.side === "short" ? "做空" : "双向"}条件`, detail: rule.conditions.join(" 且 ") });
    addNode({ id: actionId, type: "action", label: "计算仓位并开仓", detail: spec.risk.sizingMethod }, 540);
    connect(decisionSource, decisionId);
    connect(decisionId, actionId, "满足");
  });

  addNode({ id: "risk", type: "risk", label: "持续风控", detail: `止损：${spec.risk.stopLoss}；最多 ${spec.risk.maxPositions} 个持仓` });
  spec.entryRules.forEach((_, index) => connect(`open-${index}`, "risk"));
  addNode({ id: "exit", type: "decision", label: "检查离场条件", detail: spec.exitRules.join(" 或 ") });
  connect("risk", "exit");
  addNode({ id: "end", type: "end", label: "平仓并记录", detail: spec.risk.takeProfit });
  connect("exit", "end", "满足");
  connect("exit", "risk", "继续持有");

  return { nodes, edges };
}