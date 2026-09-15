"use client";

import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node, type NodeMouseHandler } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { StrategyDiagram } from "@/lib/agent/types";

const nodeColors = {
  start: "#b4162b",
  indicator: "#746d64",
  decision: "#841020",
  action: "#28745a",
  risk: "#b56b28",
  end: "#211f1c",
};

const stageLabels = ["触发", "指标与数据", "入场决策", "交易执行", "持仓风控", "离场"];

export function StrategyFlow({ diagram, selectedNodeId, disabled, onNodeSelect }: {
  diagram: StrategyDiagram;
  selectedNodeId?: string | null;
  disabled?: boolean;
  onNodeSelect?: (nodeId: string) => void;
}) {
  const nodes: Node[] = diagram.nodes.map((node) => ({
    id: node.id,
    position: { x: node.x, y: node.y },
    selectable: Boolean(node.editable) && !disabled,
    draggable: false,
    className: `${node.editable ? "flow-node-editable" : ""} ${selectedNodeId === node.id ? "flow-node-selected" : ""}`,
    data: { label: <div className="flow-node-content"><span>{node.stage ? stageLabels[["trigger", "data", "entry", "execution", "risk", "exit"].indexOf(node.stage)] : "策略节点"}{node.editable ? " · 可编辑" : ""}</span><b>{node.label}</b>{node.detail && <small>{node.detail}</small>}</div> },
    style: {
      width: 230,
      border: `1px solid ${nodeColors[node.type]}55`,
      borderTop: `3px solid ${nodeColors[node.type]}`,
      borderRadius: 0,
      background: "#faf6ef",
      boxShadow: "5px 5px 0 #b4162b16",
      color: "#211f1c",
      padding: 12,
    },
  }));
  const edges: Edge[] = diagram.edges.map((edge) => ({
    ...edge,
    type: "smoothstep",
    animated: edge.target === "risk",
    markerEnd: { type: MarkerType.ArrowClosed, color: "#9e4652" },
    style: { stroke: "#9e4652", strokeWidth: 1.5 },
    labelStyle: { fill: "#655e56", fontSize: 11 },
  }));

  const handleNodeClick: NodeMouseHandler = (_, selected) => {
    const source = diagram.nodes.find((node) => node.id === selected.id);
    if (source?.editable) onNodeSelect?.(source.id);
  };

  return (
    <div className="strategy-flow-shell">
      <div className="strategy-stage-legend">{stageLabels.map((label, index) => <span key={label}><i>{index + 1}</i>{label}</span>)}</div>
      <div className="strategy-flow" aria-label="可编辑策略逻辑图">
      <ReactFlow nodes={nodes} edges={edges} onNodeClick={handleNodeClick} nodesDraggable={false} nodesConnectable={false} elementsSelectable={!disabled} fitView fitViewOptions={{ padding: 0.12 }} minZoom={0.3} maxZoom={1.7}>
        <Background color="#d7cec1" gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>
      {!selectedNodeId && <div className="strategy-flow-hint">点击带“可编辑”标记的节点，在右侧修改策略逻辑</div>}
      </div>
    </div>
  );
}