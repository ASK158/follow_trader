import { buildStrategyDiagram } from "@/lib/agent/diagram";
import { applyCodePatches } from "@/lib/agent/code-patch";
import { extractMql5InputParameters } from "@/lib/agent/mql5-inputs";
import { streamModelCompletion, streamModificationCompletion, getAgentModelConfig } from "@/lib/agent/model";
import { runMql5RepairLoop } from "@/lib/agent/repair-loop";
import { inspectStrategyRisk } from "@/lib/agent/risk-check";
import { formatStrategySpecError, parseStrategySpec, strategySpecSchema, type AgentAttachment, type AgentMessage, type AgentStreamEvent, type CodePatch } from "@/lib/agent/types";
import { z } from "zod";
import { assertSameOrigin, audit, clientIp, consumeRateLimit } from "@/lib/auth/security";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { AgentInsufficientGasError, DuplicateAgentRequestError, commitAgentUsage, releaseAgentUsage, releaseStaleAgentReservations, reserveAgentUsage } from "@/lib/agent/billing";
import { appendAgentMessage, buildAgentContext, createAgentConversation, getAgentConversation, latestAgentArtifact } from "@/lib/agent/conversations";
import { consumeAgentDailyQuota, releaseAgentDailyQuota } from "@/lib/agent/quota";
import { recordAgentEvent } from "@/lib/agent/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  conversationId: z.string().uuid().optional(),
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

function modificationPrompt(content: string, currentStrategy: NonNullable<z.infer<typeof requestSchema>["currentStrategy"]>, requestedSpec?: z.infer<typeof strategySpecSchema>): string {
  return `用户修改需求：${content}\n\n当前 StrategySpec：\n${JSON.stringify(currentStrategy.spec)}${requestedSpec ? `\n\n用户在逻辑图编辑器中已确认的目标 StrategySpec：\n${JSON.stringify(requestedSpec)}\n必须完整采用该目标规格，不得擅自遗漏、增加或改写其业务字段。` : ""}\n\n当前完整 MQL5 源码（可能包含用户手动编辑，未涉及部分必须保留）：\n${currentStrategy.code}`;
}

export async function POST(request: Request) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录后使用 AI 实验室" }, { status: 401 });
  const rate = consumeRateLimit("agent-chat-user", `${user.id}:${clientIp(request)}`, RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW_MS);
  if (rate.limited) {
    recordAgentEvent({ requestId: crypto.randomUUID(), userId: user.id, event: "rate_limited" });
    return Response.json({ error: "请求过于频繁，请稍后再试" }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
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
  const lastUserContent = parsed.data.messages.at(-1)!.content;
  let conversation = parsed.data.conversationId ? getAgentConversation(user.id, parsed.data.conversationId) : null;
  if (parsed.data.conversationId && !conversation) return Response.json({ error: "会话不存在或无权访问" }, { status: 404 });
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
  const dailyLimit = user.role === "admin" ? 200 : 30;
  if (!consumeAgentDailyQuota(user.id, usageDate, dailyLimit)) {
    const billing = releaseAgentUsage(user.id, parsed.data.requestId);
    return Response.json({ error: `今日 AI 调用额度 ${dailyLimit} 次已用完`, billing }, { status: 429 });
  }
  try {
    if (!conversation) conversation = createAgentConversation(user.id, lastUserContent);
    appendAgentMessage({ userId: user.id, conversationId: conversation.id, role: "user", content: lastUserContent, requestId: parsed.data.requestId, attachments: (parsed.data.attachments ?? []).map(({ name, mimeType, kind }) => ({ name, mimeType, kind })) });
  } catch (error) {
    releaseAgentDailyQuota(user.id, usageDate);
    releaseAgentUsage(user.id, parsed.data.requestId);
    return Response.json({ error: error instanceof Error ? error.message : "无法保存会话" }, { status: 500 });
  }
  const conversationId = conversation.id;
  const serverMessages = buildAgentContext(user.id, conversationId);
  const storedArtifact = latestAgentArtifact(user.id, conversationId);
  const serverStrategy = storedArtifact ? { code: storedArtifact.code, spec: storedArtifact.spec, versions: storedArtifact.versions } : undefined;
  const effectiveStrategy = parsed.data.currentStrategy ?? serverStrategy;
  audit("agent.request", "agent_conversation", conversationId, user.id, request, { usageDate, billingSource: reservation.source });
  recordAgentEvent({ requestId: parsed.data.requestId, conversationId, userId: user.id, event: "queued", inputTokens: Math.ceil(serverMessages.reduce((total, item) => total + item.content.length, 0) / 4) });

  const encoder = new TextEncoder();
  const writeEvent = (controller: ReadableStreamDefaultController<Uint8Array>, event: AgentStreamEvent) => {
    controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
  };

  const operationController = new AbortController();
  request.signal.addEventListener("abort", () => operationController.abort(), { once: true });
  const startedAt = Date.now();
  const modelContext = { signal: operationController.signal, requestId: parsed.data.requestId, conversationId, userId: user.id };
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let modelContent = "";
      let replyLength = 0;
      let codeLength = 0;
      let usageCommitted = false;
      try {
        writeEvent(controller, { type: "conversation", conversationId });
        writeEvent(controller, { type: "status", message: "正在分析策略需求…" });
        const currentStrategy = effectiveStrategy;
        const attachments = (parsed.data.attachments ?? []) as AgentAttachment[];
        if (currentStrategy) {
          writeEvent(controller, { type: "status", message: "正在定位需要修改的代码块…" });
          for await (const delta of streamModificationCompletion(modificationPrompt(lastUserContent, currentStrategy, parsed.data.requestedSpec), attachments, modelContext)) {
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
            usageCommitted = true;
            audit("agent.billing_committed", "agent_request", parsed.data.requestId, user.id, request, { action: "chat", billingSource: reservation.source, gasAmount: reservation.source === "gas" ? reservation.pricing.chatCost : 0 });
            writeEvent(controller, { type: "billing", ...billing, charged: reservation.source === "gas", action: "chat" });
            writeEvent(controller, { type: "answer", reply, modelContent });
            appendAgentMessage({ userId: user.id, conversationId, role: "assistant", content: reply, requestId: parsed.data.requestId, modelContent });
            recordAgentEvent({ requestId: parsed.data.requestId, conversationId, userId: user.id, event: "completed", durationMs: Date.now() - startedAt, outputTokens: Math.ceil(modelContent.length / 4), metadata: { action: "chat" } });
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
            requestId: parsed.data.requestId,
            userId: user.id,
            conversationId,
            signal: operationController.signal,
          });
          const artifact = { reply, spec, code: compiledCode, diagram: buildStrategyDiagram(spec), risks: inspectStrategyRisk(spec, compiledCode), inputParameters: extractMql5InputParameters(compiledCode), compilation, versions: [...currentStrategy.versions, ...versions], changes: patches };
          const billing = commitAgentUsage(user.id, parsed.data.requestId, "modify");
          usageCommitted = true;
          audit("agent.billing_committed", "agent_request", parsed.data.requestId, user.id, request, { action: "modify", billingSource: reservation.source, gasAmount: reservation.source === "gas" ? reservation.pricing.modifyCost : 0 });
          writeEvent(controller, { type: "billing", ...billing, charged: reservation.source === "gas", action: "modify" });
          writeEvent(controller, { type: "artifact", artifact, modelContent });
          appendAgentMessage({ userId: user.id, conversationId, role: "assistant", content: reply, requestId: parsed.data.requestId, artifact, modelContent });
          recordAgentEvent({ requestId: parsed.data.requestId, conversationId, userId: user.id, event: "completed", durationMs: Date.now() - startedAt, outputTokens: Math.ceil(modelContent.length / 4), metadata: { action: "modify", compilation: compilation.status } });
          return;
        }
        for await (const delta of streamModelCompletion(serverMessages as AgentMessage[], attachments, modelContext)) {
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
          usageCommitted = true;
          audit("agent.billing_committed", "agent_request", parsed.data.requestId, user.id, request, { action: "chat", billingSource: reservation.source, gasAmount: reservation.source === "gas" ? reservation.pricing.chatCost : 0 });
          writeEvent(controller, { type: "billing", ...billing, charged: reservation.source === "gas", action: "chat" });
          writeEvent(controller, { type: "answer", reply, modelContent });
          appendAgentMessage({ userId: user.id, conversationId, role: "assistant", content: reply, requestId: parsed.data.requestId, modelContent });
          recordAgentEvent({ requestId: parsed.data.requestId, conversationId, userId: user.id, event: "completed", durationMs: Date.now() - startedAt, outputTokens: Math.ceil(modelContent.length / 4), metadata: { action: "chat" } });
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
          requestId: parsed.data.requestId,
          userId: user.id,
          conversationId,
          signal: operationController.signal,
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
        usageCommitted = true;
        audit("agent.billing_committed", "agent_request", parsed.data.requestId, user.id, request, { action: "generate", billingSource: reservation.source, gasAmount: reservation.source === "gas" ? reservation.pricing.generateCost : 0 });
        writeEvent(controller, { type: "billing", ...billing, charged: reservation.source === "gas", action: "generate" });
        writeEvent(controller, { type: "artifact", artifact, modelContent });
        appendAgentMessage({ userId: user.id, conversationId, role: "assistant", content: reply, requestId: parsed.data.requestId, artifact, modelContent });
        recordAgentEvent({ requestId: parsed.data.requestId, conversationId, userId: user.id, event: "completed", durationMs: Date.now() - startedAt, outputTokens: Math.ceil(modelContent.length / 4), metadata: { action: "generate", compilation: compilation.status } });
      } catch (error) {
        const message = formatStrategySpecError(error);
        const billing = releaseAgentUsage(user.id, parsed.data.requestId);
        if (!usageCommitted) releaseAgentDailyQuota(user.id, usageDate);
        const cancelled = operationController.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
        audit("agent.billing_released", "agent_request", parsed.data.requestId, user.id, request, { reason: cancelled ? "cancelled" : "error", billingSource: reservation.source });
        appendAgentMessage({ userId: user.id, conversationId, role: "assistant", content: cancelled ? "请求已由用户取消" : message, requestId: parsed.data.requestId, status: cancelled ? "cancelled" : "failed" });
        recordAgentEvent({ requestId: parsed.data.requestId, conversationId, userId: user.id, event: cancelled ? "cancelled" : "failed", durationMs: Date.now() - startedAt, metadata: { message } });
        if (!cancelled) {
          writeEvent(controller, { type: "billing", ...billing, charged: false });
          writeEvent(controller, { type: "error", message: message.includes("API key") ? "AI 服务配置无效" : message });
        }
      } finally {
        try { controller.close(); } catch { /* 客户端已取消读取时流可能已经关闭。 */ }
      }
    },
    cancel() { operationController.abort(); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Accel-Buffering": "no",
    },
  });
}