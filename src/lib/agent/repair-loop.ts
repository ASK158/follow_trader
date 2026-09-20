import "server-only";
import { compileMql5Queued } from "./compile-queue";
import { streamRepairCompletion } from "./model";
import { expectedMql5EntryPoint, type StrategyCodeVersion, type StrategySpec } from "./types";

export const MAX_REPAIR_ATTEMPTS = 2;

export type CompilerIssue = { line?: number; column?: number; message: string };

export function extractCompilerIssues(log: string): CompilerIssue[] {
  const issues: CompilerIssue[] = [];
  for (const rawLine of log.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^(?:result|compilation|\d+ errors?, \d+ warnings?)/i.test(line)) continue;
    if (!/error|undeclared|wrong parameters|cannot convert|expected|not defined|failed/i.test(line)) continue;
    const location = line.match(/\((\d+)(?:,(\d+))?\)/) || line.match(/:(\d+)(?::(\d+))?/);
    const message = line.replace(/[A-Z]:\\[^\s]+|\/[^\s]+\.mq5/gi, "<source>").slice(0, 600);
    issues.push({ ...(location ? { line: Number(location[1]), ...(location[2] ? { column: Number(location[2]) } : {}) } : {}), message });
  }
  return issues.slice(0, 30);
}

function repairPrompt(spec: StrategySpec, code: string, issues: CompilerIssue[], attempt: number): string {
  return `第 ${attempt} 次自动修复。\n\nStrategySpec：\n${JSON.stringify(spec)}\n\nMetaEditor 编译错误（只根据这些错误修复）：\n${issues.map((issue) => `${issue.line ? `第 ${issue.line} 行${issue.column ? `，第 ${issue.column} 列` : ""}：` : ""}${issue.message}`).join("\n") || "请根据完整编译日志修复。"}\n\n完整当前 MQL5 源码：\n${code}`;
}

export async function runMql5RepairLoop(options: { code: string; spec: StrategySpec; onStatus: (message: string) => void; requestId: string; userId: string; conversationId?: string | null; signal?: AbortSignal; initialKind?: "generated" | "modified"; startingVersion?: number }) {
  const versions: StrategyCodeVersion[] = [];
  let code = options.code;
  let compilation = await compileMql5Queued({ code, strategyName: options.spec.name, requestId: options.requestId, userId: options.userId, conversationId: options.conversationId, signal: options.signal });
  versions.push({ number: options.startingVersion ?? 1, kind: options.initialKind ?? "generated", code, compilation });

  for (let attempt = 1; compilation.status === "failed" && attempt <= MAX_REPAIR_ATTEMPTS; attempt += 1) {
    const issues = extractCompilerIssues(compilation.log);
    options.onStatus(`编译失败，正在进行第 ${attempt}/${MAX_REPAIR_ATTEMPTS} 次 AI 自动修复…`);
    let repaired = "";
    for await (const delta of streamRepairCompletion(repairPrompt(options.spec, code, issues, attempt), options.spec.programType, { signal: options.signal, requestId: options.requestId, conversationId: options.conversationId, userId: options.userId })) repaired += delta;
    repaired = repaired.trim().replace(/^```(?:mql5|cpp)?\s*/i, "").replace(/\s*```$/, "").trim();
    const entryPoint = expectedMql5EntryPoint(options.spec);
    if (!repaired || repaired.length < 100 || !(new RegExp(`\\b${entryPoint}\\s*\\(`)).test(repaired)) break;
    code = repaired;
    options.onStatus(`正在编译第 ${attempt} 次自动修复后的代码…`);
    compilation = await compileMql5Queued({ code, strategyName: options.spec.name, requestId: options.requestId, userId: options.userId, conversationId: options.conversationId, signal: options.signal });
    versions.push({ number: (options.startingVersion ?? 1) + versions.length, kind: "auto-repair", code, compilation });
  }
  return { code, compilation, versions };
}