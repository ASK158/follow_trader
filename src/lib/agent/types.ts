import { z } from "zod";

function conditionDepth(condition: StrategyCondition): number {
  return condition.kind === "condition" ? 1 : 1 + Math.max(...condition.children.map(conditionDepth));
}

export const strategyConditionSchema: z.ZodType<StrategyCondition> = z.lazy(() => z.union([
  z.object({
    id: z.string().min(1).max(80),
    kind: z.literal("condition"),
    expression: z.string().min(1).max(300),
  }),
  z.object({
    id: z.string().min(1).max(80),
    kind: z.literal("group"),
    operator: z.enum(["and", "or"]),
    children: z.array(strategyConditionSchema).min(1).max(12),
  }),
])).superRefine((condition, context) => {
  if (conditionDepth(condition) > 4) context.addIssue({ code: "custom", message: "条件组最多嵌套 3 层" });
});

export type StrategyCondition =
  | { id: string; kind: "condition"; expression: string }
  | { id: string; kind: "group"; operator: "and" | "or"; children: StrategyCondition[] };

export const agentProgramTypes = ["expert-advisor", "custom-indicator"] as const;
export type AgentProgramType = (typeof agentProgramTypes)[number];

const indicatorRiskDefaults = {
  sizingMethod: "不适用（指标不执行交易）",
  riskPerTradePercent: 0,
  stopLoss: "不适用（指标不执行交易）",
  takeProfit: "不适用（指标不执行交易）",
  maxPositions: 0,
  protections: [] as string[],
};

function normalizeStrategySpecInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const source = input as Record<string, unknown>;
  const rawProgramType = String(source.programType ?? "").toLowerCase();
  const description = `${String(source.name ?? "")} ${String(source.summary ?? "")} ${String(source.strategyType ?? "")}`.toLowerCase();
  const programType: AgentProgramType = rawProgramType === "custom-indicator" || rawProgramType === "indicator" || rawProgramType === "指标"
    || (!rawProgramType && /(?:custom\s+indicator|技术指标|自定义指标)/i.test(description))
    ? "custom-indicator"
    : "expert-advisor";
  if (programType !== "custom-indicator") return { ...source, programType };

  const normalized: Record<string, unknown> = {
    ...source,
    programType,
    entryRules: [],
    exitRules: [],
    risk: { ...indicatorRiskDefaults },
  };
  // 指标没有入场、离场和持仓语义。模型偶尔会沿用 EA 模板输出 null、空对象
  // 或残留条件树；在进入 Zod 校验前删除这些不适用字段，避免误判为指标逻辑错误。
  delete normalized.exitConditionTree;
  return normalized;
}

const strategySpecObjectSchema = z.object({
  programType: z.enum(agentProgramTypes),
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
    id: z.string().min(1).max(80).optional(),
    side: z.enum(["long", "short", "both"]),
    conditions: z.array(z.string().min(1).max(300)).min(1).max(12),
    conditionTree: strategyConditionSchema.optional(),
  })).max(4),
  exitRules: z.array(z.string().min(1).max(300)).max(12),
  exitConditionTree: strategyConditionSchema.optional(),
  risk: z.object({
    sizingMethod: z.string().min(1).max(120),
    riskPerTradePercent: z.number().min(0).max(100),
    stopLoss: z.string().min(1).max(200),
    takeProfit: z.string().min(1).max(200),
    maxPositions: z.number().int("最大持仓数必须是整数").min(0, "最大持仓数不能小于 0").max(100, "最大持仓数不能超过 100"),
    protections: z.array(z.string().min(1).max(200)).max(12),
  }),
  assumptions: z.array(z.string().min(1).max(300)).max(12),
}).superRefine((spec, context) => {
  if (spec.programType === "expert-advisor") {
    if (!spec.entryRules.length) context.addIssue({ code: "custom", path: ["entryRules"], message: "EA 至少需要一条入场规则" });
    if (!spec.exitRules.length) context.addIssue({ code: "custom", path: ["exitRules"], message: "EA 至少需要一条离场规则" });
    if (spec.risk.maxPositions < 1) context.addIssue({ code: "custom", path: ["risk", "maxPositions"], message: "EA 最大持仓数必须是 1 到 100 之间的整数" });
  } else if (spec.risk.maxPositions !== 0) {
    context.addIssue({ code: "custom", path: ["risk", "maxPositions"], message: "自定义指标不执行交易，最大持仓数必须为 0" });
  }
});

export const strategySpecSchema = z.preprocess(normalizeStrategySpecInput, strategySpecObjectSchema);

export function parseStrategySpec(input: unknown): StrategySpec {
  return strategySpecSchema.parse(input);
}

export function formatStrategySpecError(error: unknown): string {
  if (!(error instanceof z.ZodError)) return error instanceof Error ? error.message : "生成 MQL5 程序时发生未知错误";
  const issue = error.issues[0];
  const path = issue?.path.length ? `（${issue.path.join(".")}）` : "";
  return `程序规格校验失败${path}：${issue?.message ?? "字段不符合要求"}`;
}

export type StrategySpec = z.infer<typeof strategySpecSchema>;

export function expectedMql5EntryPoint(spec: Pick<StrategySpec, "programType">): "OnTick" | "OnCalculate" {
  return spec.programType === "custom-indicator" ? "OnCalculate" : "OnTick";
}

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

export type AgentAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: "image" | "document";
  encoding: "text" | "data-url";
  data: string;
};

export type DiagramNode = {
  id: string;
  type: "start" | "indicator" | "decision" | "action" | "risk" | "end";
  label: string;
  detail?: string;
  stage?: "trigger" | "data" | "entry" | "execution" | "risk" | "exit";
  editable?: boolean;
  binding?:
    | { kind: "environment" }
    | { kind: "indicator"; index: number }
    | { kind: "entry"; index: number }
    | { kind: "execution"; index: number }
    | { kind: "risk" }
    | { kind: "exit" }
    | { kind: "result" };
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
  | { type: "billing"; freeRemaining: number; freeEligible: boolean; gasBalance: number; isAdmin: boolean; pricing: { freeUsageLimit: number; chatCost: number; modifyCost: number; generateCost: number; minimumGasToStart: number }; charged: boolean; action?: "chat" | "modify" | "generate" }
  | { type: "reply-delta"; delta: string }
  | { type: "code-delta"; delta: string }
  | { type: "answer"; reply: string; modelContent: string }
  | { type: "artifact"; artifact: AgentArtifact; modelContent: string }
  | { type: "error"; message: string };