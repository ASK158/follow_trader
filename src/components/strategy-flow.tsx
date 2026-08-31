"use client";

import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { StrategyDiagram } from "@/lib/agent/types";

const nodeColors = {
  start: "#245dba",
  indicator: "#476d9e",
  decision: "#8b63c7",
  action: "#168d70",
  risk: "#d07a35",
  end: "#1e6b58",
};

export function StrategyFlow({ diagram }: { diagram: StrategyDiagram }) {
  const nodes: Node[] = diagram.nodes.map((node) => ({
    id: node.id,
    position: { x: node.x, y: node.y },
    data: { label: <div className="flow-node-content"><b>{node.label}</b>{node.detail && <small>{node.detail}</small>}</div> },
    style: {
      width: 230,
      border: `1px solid ${nodeColors[node.type]}55`,
      borderTop: `3px solid ${nodeColors[node.type]}`,
      borderRadius: 12,
      background: "#fff",
      boxShadow: "0 8px 22px #294d7d16",
      color: "#10233f",
      padding: 12,
    },
  }));
  const edges: Edge[] = diagram.edges.map((edge) => ({
    ...edge,
    type: "smoothstep",
    animated: edge.target === "risk",
    markerEnd: { type: MarkerType.ArrowClosed, color: "#7190ba" },
    style: { stroke: "#7190ba", strokeWidth: 1.5 },
    labelStyle: { fill: "#61728b", fontSize: 11 },
  }));

  return (
    <div className="strategy-flow" aria-label="策略逻辑图">
      <ReactFlow nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.18 }} minZoom={0.35} maxZoom={1.6}>
        <Background color="#dce6f3" gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}