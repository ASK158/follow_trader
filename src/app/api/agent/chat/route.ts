import { buildStrategyDiagram } from "@/lib/agent/diagram";
import { applyCodePatches } from "@/lib/agent/code-patch";
import { extractMql5InputParameters } from "@/lib/agent/mql5-inputs";
import { streamModelCompletion, streamModificationCompletion, getAgentModelConfig } from "@/lib/agent/model";
import { runMql5RepairLoop } from "@/lib/agent/repair-loop";
import { inspectStrategyRisk } from "@/lib/agent/risk-check";
import { strategySpecSchema, type AgentMessage, type AgentStreamEvent, type CodePatch } from "@/lib/agent/types";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestWindows = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_REQUESTS = 6;
const MAX_REQUEST_BYTES = 200_000;

const requestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(60_000),
  })).min(1).max(16),
  clientModel: z.object({
    apiKey: z.string().min(1).max(500),
    endpoint: z.string().url().max(500).refine((endpoint) => endpoint.startsWith("https://") || endpoint.startsWith("http://localhost") || endpoint.startsWith("http://127.0.0.1"), "仅允许 HTTPS 或本地模型地址"),
    model: z.string().min(1).max(200),
  }).optional(),
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
  hasPendingChange: z.boolean().optional(),
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

function modificationPrompt(content: string, currentStrategy: NonNullable<z.infer<typeof requestSchema>["currentStrategy"]>): string {
  return `用户修改需求：${content}\n\n当前 StrategySpec：\n${JSON.stringify(currentStrategy.spec)}\n\n当前完整 MQL5 源码：\n${currentStrategy.code}`;
}

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "不允许跨站调用 Agent" }, { status: 403 });
  }
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
    return Response.json({ error: "请求必须包含以用户消息结尾的有效对话" }, { status: 400 });
  }
  if (parsed.data.clientModel && process.env.NODE_ENV === "production") {
    return Response.json({ error: "生产环境不允许通过网页提交 API 配置" }, { status: 403 });
  }
  try {
    getAgentModelConfig(parsed.data.clientModel);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "AI 服务未配置" }, { status: 503 });
  }

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
        if (currentStrategy) {
          writeEvent(controller, { type: "status", message: "正在定位需要修改的代码块…" });
          for await (const delta of streamModificationCompletion(modificationPrompt(parsed.data.messages.at(-1)!.content, currentStrategy), parsed.data.clientModel)) {
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
            writeEvent(controller, { type: "answer", reply, modelContent });
            return;
          }
          const specText = sectionContent(modelContent, "spec", false).trim();
          const patches = JSON.parse(sectionContent(modelContent, "patches", false)) as CodePatch[];
          if (mode !== "modify" || !reply || !specText || !Array.isArray(patches)) throw new Error("模型没有返回完整的局部修改方案，请重试");
          if (parsed.data.hasPendingChange) throw new Error("请先确认或撤回当前待审阅的局部修改，再进行下一次代码修改");
          const spec = strategySpecSchema.parse(JSON.parse(specText));
          const code = applyCodePatches(currentStrategy.code.replace(/\r\n/g, "\n"), patches);
          writeEvent(controller, { type: "status", message: `已安全应用 ${patches.length} 个代码块修改，正在使用 MetaEditor 验证…` });
          const { code: compiledCode, compilation, versions } = await runMql5RepairLoop({
            code,
            spec,
            clientConfig: parsed.data.clientModel,
            initialKind: "modified",
            startingVersion: Math.max(...currentStrategy.versions.map((version) => version.number), 0) + 1,
            onStatus: (message) => writeEvent(controller, { type: "status", message }),
          });
          const artifact = { reply, spec, code: compiledCode, diagram: buildStrategyDiagram(spec), risks: inspectStrategyRisk(spec, compiledCode), inputParameters: extractMql5InputParameters(compiledCode), compilation, versions: [...currentStrategy.versions, ...versions], changes: patches };
          writeEvent(controller, { type: "artifact", artifact, modelContent });
          return;
        }
        for await (const delta of streamModelCompletion(parsed.data.messages as AgentMessage[], parsed.data.clientModel)) {
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
          writeEvent(controller, { type: "answer", reply, modelContent });
          return;
        }
        const specText = sectionContent(modelContent, "spec", false).trim();
        const generatedCode = cleanCode(sectionContent(modelContent, "code", false));
        if (mode !== "create" || !reply || !specText || !generatedCode) throw new Error("模型输出不完整，请重试或明确说明是否需要创建策略");

        const spec = strategySpecSchema.parse(JSON.parse(specText));
        writeEvent(controller, { type: "status", message: "正在使用 MetaEditor 验证 MQL5 代码…" });
        const { code, compilation, versions } = await runMql5RepairLoop({
          code: generatedCode,
          spec,
          clientConfig: parsed.data.clientModel,
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
        writeEvent(controller, { type: "artifact", artifact, modelContent });
      } catch (error) {
        const message = error instanceof Error ? error.message : "生成策略时发生未知错误";
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