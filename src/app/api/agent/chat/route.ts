import { buildStrategyDiagram } from "@/lib/agent/diagram";
import { applyCodePatches } from "@/lib/agent/code-patch";
import { extractMql5InputParameters } from "@/lib/agent/mql5-inputs";
import { streamModelCompletion, streamModificationCompletion, getAgentModelConfig } from "@/lib/agent/model";
import { runMql5RepairLoop } from "@/lib/agent/repair-loop";
import { inspectStrategyRisk } from "@/lib/agent/risk-check";
import { formatStrategySpecError, parseStrategySpec, strategySpecSchema, type AgentAttachment, type AgentMessage, type AgentStreamEvent, type CodePatch } from "@/lib/agent/types";
import { z } from "zod";
import { assertSameOrigin, audit } from "@/lib/auth/security";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { getMarketplaceDb } from "@/lib/marketplace/db";
import { AgentInsufficientGasError, DuplicateAgentRequestError, commitAgentUsage, releaseAgentUsage, releaseStaleAgentReservations, reserveAgentUsage } from "@/lib/agent/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestWindows = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_REQUESTS = 6;
const MAX_REQUEST_BYTES = 12_000_000;
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 5_000_000;

const attachmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(160),
  mimeType: z.string().min(1).max(100),
  size: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
  kind: z.enum(["image", "document"]),
  encoding: z.enum(["text", "data-url"]),
  data: z.string().min(1).max(7_000_000),
}).superRefine((attachment, context) => {
  if (attachment.kind === "image" && (!attachment.mimeType.startsWith("image/") || attachment.encoding !== "data-url")) {
    context.addIssue({ code: "custom", message: "图片附件格式不正确" });
  }
  if (attachment.encoding === "data-url" && !attachment.data.startsWith(`data:${attachment.mimeType};base64,`)) {
    context.addIssue({ code: "custom", message: "附件内容格式不正确" });
  }
});

const requestSchema = z.object({
  requestId: z.string().uuid(),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(60_000),
  })).min(1).max(16),
  currentStrategy: z.object({
    code: z.string().min(100).max(80_000),
    spec: strategySpecSchema,
    versions: z.array(z.object({
      number: z.number().int().positive(),
      kind: z.enum(["generated", "modified", "auto-repair"]),
      code: z.string().min(1).max(80_000),
      compilation: z.object({ status: z.enum(["passed", "failed", "unavailable"]), summary: z.string(), errors: z.number(), warnings: z.number(), log: z.string() }),
    })).max(12),
  }).optional(),
  requestedSpec: strategySpecSchema.optional(),
  hasPendingChange: z.boolean().optional(),
  attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).optional(),
});

function sectionContent(source: string, tag: "mode" | "reply" | "spec" | "code" | "patches", allowPartial: boolean): string {
  const opening = `<${tag}>`;
  const start = source.indexOf(opening);
  if (start < 0) return "";
  const contentStart = start + opening.length;
  const end = source.indexOf(`</${tag}>`, contentStart);
  if (end < 0 && !allowPartial) return "";
  return source.slice(contentStart, end < 0 ? source.length : end);
}

function cleanCode(code: string): string {
  return code.trim().replace(/^```(?:mql5|cpp)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function isRateLimited(request: Request): boolean {
  const client = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const now = Date.now();
  const current = requestWindows.get(client);
  if (!current || current.resetAt <= now) {
    requestWindows.set(client, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT_REQUESTS;
}

function modificationPrompt(content: string, currentStrategy: NonNullable<z.infer<typeof requestSchema>["currentStrategy"]>, requestedSpec?: z.infer<typeof strategySpecSchema>): string {
  return `用户修改需求：${content}\n\n当前 StrategySpec：\n${JSON.stringify(currentStrategy.spec)}${requestedSpec ? `\n\n用户在逻辑图编辑器中已确认的目标 StrategySpec：\n${JSON.stringify(requestedSpec)}\n必须完整采用该目标规格，不得擅自遗漏、增加或改写其业务字段。` : ""}\n\n当前完整 MQL5 源码（可能包含用户手动编辑，未涉及部分必须保留）：\n${currentStrategy.code}`;
}

export async function POST(request: Request) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录后使用 AI 实验室" }, { status: 401 });
  if (isRateLimited(request)) {
    return Response.json({ error: "请求过于频繁，请十分钟后再试" }, { status: 429, headers: { "Retry-After": "600" } });
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_REQUEST_BYTES) {
    return Response.json({ error: "对话内容过长，请新建会话后重试" }, { status: 413 });
  }
  const requestText = await request.text();
  if (Buffer.byteLength(requestText, "utf8") > MAX_REQUEST_BYTES) {
    return Response.json({ error: "对话内容过长，请新建会话后重试" }, { status: 413 });
  }
  const parsed = requestSchema.safeParse((() => { try { return JSON.parse(requestText); } catch { return null; } })());
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== "user") {
    return Response.json({ error: parsed.success ? "请求必须包含以用户消息结尾的有效对话" : parsed.error.issues[0]?.message || "请求参数不正确" }, { status: 400 });
  }
  try {
    getAgentModelConfig();
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "AI 服务未配置" }, { status: 503 });
  }
  let reservation;
  try {
    releaseStaleAgentReservations(user.id);
    reservation = reserveAgentUsage(user.id, parsed.data.requestId);
  } catch (error) {
    if (error instanceof AgentInsufficientGasError) return Response.json({ error: error.message, billing: error.status }, { status: 402 });
    if (error instanceof DuplicateAgentRequestError) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
  const usageDate = new Date().toISOString().slice(0, 10);
  const db = getMarketplaceDb();
  const usage = db.prepare("SELECT request_count FROM agent_usage WHERE user_id = ? AND usage_date = ?").get(user.id, usageDate) as { request_count: number } | undefined;
  const dailyLimit = user.role === "admin" ? 200 : 30;
  if ((usage?.request_count ?? 0) >= dailyLimit) {
    const billing = releaseAgentUsage(user.id, parsed.data.requestId);
    return Response.json({ error: `今日 AI 调用额度 ${dailyLimit} 次已用完`, billing }, { status: 429 });
  }
  db.prepare("INSERT INTO agent_usage (user_id, usage_date, request_count) VALUES (?, ?, 1) ON CONFLICT(user_id, usage_date) DO UPDATE SET request_count = request_count + 1").run(user.id, usageDate);
  audit("agent.request", "user", user.id, user.id, request, { usageDate, billingSource: reservation.source });

  const encoder = new TextEncoder();
  const writeEvent = (controller: ReadableStreamDefaultController<Uint8Array>, event: AgentStreamEvent) => {
    controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let modelContent = "";
      let replyLength = 0;
      let codeLength = 0;
      try {
        writeEvent(controller, { type: "status", message: "正在分析策略需求…" });
        const currentStrategy = parsed.data.currentStrategy;
        const attachments = (parsed.data.attachments ?? []) as AgentAttachment[];
        if (currentStrategy) {
          writeEvent(controller, { type: "status", message: "正在定位需要修改的代码块…" });
          for await (const delta of streamModificationCompletion(modificationPrompt(parsed.data.messages.at(-1)!.content, currentStrategy, parsed.data.requestedSpec), attachments)) {
            modelContent += delta;
            const reply = sectionContent(modelContent, "reply", true);
            if (reply.length > replyLength) {
              writeEvent(controller, { type: "reply-delta", delta: reply.slice(replyLength) });
              replyLength = reply.length;
            }
          }

          const reply = sectionContent(modelContent, "reply", false).trim();
          const mode = sectionContent(modelContent, "mode", false).trim();
          if (mode === "answer") {
            if (!reply) throw new Error("模型没有返回有效答复，请重试");
            const billing = commitAgentUsage(user.id, parsed.data.requestId, "chat");
            audit("agent.billing_committed", "agent_request", parsed.data.requestId, user.id, request, { action: "chat", billingSource: reservation.source, gasAmount: reservation.source === "gas" ? reservation.pricing.chatCost : 0 });
            writeEvent(controller, { type: "billing", ...billing, charged: reservation.source === "gas", action: "chat" });
            writeEvent(controller, { type: "answer", reply, modelContent });
            return;
          }
          const specText = sectionContent(modelContent, "spec", false).trim();
          const patches = JSON.parse(sectionContent(modelContent, "patches", false)) as CodePatch[];
          if (mode !== "modify" || !reply || !specText || !Array.isArray(patches)) throw new Error("模型没有返回完整的局部修改方案，请重试");
          if (parsed.data.hasPendingChange) throw new Error("请先确认或撤回当前待审阅的局部修改，再进行下一次代码修改");
          const modelSpec = parseStrategySpec(JSON.parse(specText));
          const spec = parsed.data.requestedSpec ?? modelSpec;
          const code = applyCodePatches(currentStrategy.code.replace(/\r\n/g, "\n"), patches);
          writeEvent(controller, { type: "status", message: `已安全应用 ${patches.length} 个代码块修改，正在使用 MetaEditor 验证…` });
          const { code: compiledCode, compilation, versions } = await runMql5RepairLoop({
            code,
            spec,
            initialKind: "modified",
            startingVersion: Math.max(...currentStrategy.versions.map((version) => version.number), 0) + 1,
            onStatus: (message) => writeEvent(controller, { type: "status", message }),
          });
          const artifact = { reply, spec, code: compiledCode, diagram: buildStrategyDiagram(spec), risks: inspectStrategyRisk(spec, compiledCode), inputParameters: extractMql5InputParameters(compiledCode), compilation, versions: [...currentStrategy.versions, ...versions], changes: patches };
          const billing = commitAgentUsage(user.id, parsed.data.requestId, "modify");
          audit("agent.billing_committed", "agent_request", parsed.data.requestId, user.id, request, { action: "modify", billingSource: reservation.source, gasAmount: reservation.source === "gas" ? reservation.pricing.modifyCost : 0 });
          writeEvent(controller, { type: "billing", ...billing, charged: reservation.source === "gas", action: "modify" });
          writeEvent(controller, { type: "artifact", artifact, modelContent });
          return;
        }
        for await (const delta of streamModelCompletion(parsed.data.messages as AgentMessage[], attachments)) {
          modelContent += delta;
          const reply = sectionContent(modelContent, "reply", true);
          if (reply.length > replyLength) {
            writeEvent(controller, { type: "reply-delta", delta: reply.slice(replyLength) });
            replyLength = reply.length;
          }
          const code = sectionContent(modelContent, "code", true);
          if (code.length > codeLength) {
            writeEvent(controller, { type: "code-delta", delta: code.slice(codeLength) });
            codeLength = code.length;
          }
        }

        const reply = sectionContent(modelContent, "reply", false).trim();
        const mode = sectionContent(modelContent, "mode", false).trim();
        if (mode === "answer") {
          if (!reply) throw new Error("模型没有返回有效答复，请重试");
          const billing = commitAgentUsage(user.id, parsed.data.requestId, "chat");
          audit("agent.billing_committed", "agent_request", parsed.data.requestId, user.id, request, { action: "chat", billingSource: reservation.source, gasAmount: reservation.source === "gas" ? reservation.pricing.chatCost : 0 });
          writeEvent(controller, { type: "billing", ...billing, charged: reservation.source === "gas", action: "chat" });
          writeEvent(controller, { type: "answer", reply, modelContent });
          return;
        }
        const specText = sectionContent(modelContent, "spec", false).trim();
        const generatedCode = cleanCode(sectionContent(modelContent, "code", false));
        if (mode !== "create" || !reply || !specText || !generatedCode) throw new Error("模型输出不完整，请重试或明确说明是否需要创建策略");

        const spec = parseStrategySpec(JSON.parse(specText));
        writeEvent(controller, { type: "status", message: "正在使用 MetaEditor 验证 MQL5 代码…" });
        const { code, compilation, versions } = await runMql5RepairLoop({
          code: generatedCode,
          spec,
          onStatus: (message) => writeEvent(controller, { type: "status", message }),
        });
        const artifact = {
          reply,
          spec,
          code,
          diagram: buildStrategyDiagram(spec),
          risks: inspectStrategyRisk(spec, code),
          inputParameters: extractMql5InputParameters(code),
          compilation,
          versions,
        };
        const billing = commitAgentUsage(user.id, parsed.data.requestId, "generate");
        audit("agent.billing_committed", "agent_request", parsed.data.requestId, user.id, request, { action: "generate", billingSource: reservation.source, gasAmount: reservation.source === "gas" ? reservation.pricing.generateCost : 0 });
        writeEvent(controller, { type: "billing", ...billing, charged: reservation.source === "gas", action: "generate" });
        writeEvent(controller, { type: "artifact", artifact, modelContent });
      } catch (error) {
        const message = formatStrategySpecError(error);
        const billing = releaseAgentUsage(user.id, parsed.data.requestId);
        audit("agent.billing_released", "agent_request", parsed.data.requestId, user.id, request, { reason: "error", billingSource: reservation.source });
        writeEvent(controller, { type: "billing", ...billing, charged: false });
        writeEvent(controller, { type: "error", message: message.includes("API key") ? "AI 服务配置无效" : message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}