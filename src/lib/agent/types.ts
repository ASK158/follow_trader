import { z } from "zod";

export const strategySpecSchema = z.object({
  name: z.string().min(1).max(80),
  summary: z.string().min(1).max(600),
  symbol: z.string().min(1).max(30),
  timeframe: z.string().min(1).max(20),
  strategyType: z.string().min(1).max(60),
  indicators: z.array(z.object({
    id: z.string().min(1).max(40),
    name: z.string().min(1).max(80),
    parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  })).max(12),
  entryRules: z.array(z.object({
    side: z.enum(["long", "short", "both"]),
    conditions: z.array(z.string().min(1).max(300)).min(1).max(12),
  })).min(1).max(4),
  exitRules: z.array(z.string().min(1).max(300)).min(1).max(12),
  risk: z.object({
    sizingMethod: z.string().min(1).max(120),
    riskPerTradePercent: z.number().min(0).max(100),
    stopLoss: z.string().min(1).max(200),
    takeProfit: z.string().min(1).max(200),
    maxPositions: z.number().int().min(1).max(100),
    protections: z.array(z.string().min(1).max(200)).max(12),
  }),
  assumptions: z.array(z.string().min(1).max(300)).max(12),
});

export type StrategySpec = z.infer<typeof strategySpecSchema>;

export type Mql5InputParameter = {
  name: string;
  type: "bool" | "int" | "long" | "double" | "string" | "datetime" | "enum";
  value: string;
  comment?: string;
  group?: string;
};

export type AgentMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ClientModelConfig = {
  apiKey: string;
  endpoint: string;
  model: string;
};

export type DiagramNode = {
  id: string;
  type: "start" | "indicator" | "decision" | "action" | "risk" | "end";
  label: string;
  detail?: string;
  x: number;
  y: number;
};

export type DiagramEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

export type StrategyDiagram = {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
};

export type RiskFinding = {
  id: string;
  severity: "high" | "medium" | "low" | "info";
  title: string;
  detail: string;
};

export type Mql5Compilation = {
  status: "passed" | "failed" | "unavailable";
  summary: string;
  errors: number;
  warnings: number;
  log: string;
};

export type CodePatch = {
  reason: string;
  search: string;
  replace: string;
};

export type StrategyCodeVersion = {
  number: number;
  kind: "generated" | "modified" | "auto-repair";
  code: string;
  compilation: Mql5Compilation;
};

export type AgentArtifact = {
  reply: string;
  spec: StrategySpec;
  diagram: StrategyDiagram;
  code: string;
  risks: RiskFinding[];
  inputParameters: Mql5InputParameter[];
  compilation: Mql5Compilation;
  versions: StrategyCodeVersion[];
  changes?: CodePatch[];
};

export type AgentStreamEvent =
  | { type: "status"; message: string }
  | { type: "reply-delta"; delta: string }
  | { type: "code-delta"; delta: string }
  | { type: "answer"; reply: string; modelContent: string }
  | { type: "artifact"; artifact: AgentArtifact; modelContent: string }
  | { type: "error"; message: string };