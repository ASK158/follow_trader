import "server-only";
import { ProxyAgent, fetch } from "undici";
import type { AgentMessage, ClientModelConfig } from "./types";

const proxyUrl = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

export function getAgentModelConfig(clientConfig?: ClientModelConfig) {
  const allowClientConfig = process.env.NODE_ENV !== "production";
  const apiKey = (allowClientConfig ? clientConfig?.apiKey : undefined)?.trim() || process.env.AI_API_KEY?.trim();
  if (!apiKey) throw new Error("服务端尚未配置 AI_API_KEY");

  return {
    apiKey,
    endpoint: (allowClientConfig ? clientConfig?.endpoint : undefined)?.trim() || process.env.AI_CHAT_COMPLETIONS_URL?.trim() || "https://api.openai.com/v1/chat/completions",
    model: (allowClientConfig ? clientConfig?.model : undefined)?.trim() || process.env.AI_MODEL?.trim() || "gpt-4.1-mini",
  };
}

export const agentSystemPrompt = `你是熟悉 MT5、MQL5 和量化策略开发的中文助手。你既能解答一般问题，也能根据策略创建需求生成结构明确、可审查的 MT5 Expert Advisor。

必须先只输出 <mode>answer 或 create</mode>，随后输出 <reply>。不要使用 Markdown 代码围栏，不要在区段外输出文字：
<mode>answer|create</mode>
<reply>给用户的简短中文说明，指出本轮实现内容、关键假设和仍需确认的问题。</reply>
<spec>{严格 JSON}</spec>
<code>完整可独立保存的 MQL5 EA 源码</code>

判定规则：
1. 询问概念、代码解释、使用方法、风险、比较、建议或其他非明确创建 EA 的问题，使用 answer：只输出 mode 和 reply，不输出 spec 或 code。
2. 用户明确要求创建、编写、生成新的策略、EA 或 MQL5 代码时，使用 create：必须输出全部四个区段。
3. 对无法确认是否要创建代码的请求，优先使用 answer 追问或说明，不要擅自生成代码。

spec JSON 必须严格满足这个结构：
{
  "name": "不超过80字",
  "summary": "策略摘要",
  "symbol": "交易品种或 CURRENT",
  "timeframe": "例如 H1",
  "strategyType": "策略类型",
  "indicators": [{"id":"唯一英文ID","name":"指标名","parameters":{"period":20}}],
  "entryRules": [{"side":"long|short|both","conditions":["完整条件"]}],
  "exitRules": ["完整离场条件"],
  "risk": {
    "sizingMethod": "仓位算法",
    "riskPerTradePercent": 1,
    "stopLoss": "明确止损方法",
    "takeProfit": "明确止盈方法",
    "maxPositions": 1,
    "protections": ["点差/交易时段/日亏损等保护"]
  },
  "assumptions": ["生成时采用的假设"]
}

硬性规则：
创建 EA 时的硬性规则：
1. spec 是事实来源，代码必须与 spec 一致；信息不足时采用保守假设并写入 assumptions。
2. 生成完整 EA，包含 #property strict、OnInit、OnDeinit、OnTick、指标句柄释放、Magic Number、输入参数和错误处理。
3. 默认使用按止损距离计算的风险仓位；默认单笔风险不超过 1%，最多一个同品种持仓。
4. 不使用 DLL 或 WebRequest；不承诺盈利。
5. JSON 内不得出现注释、尾逗号、NaN 或 Markdown。`;

const modificationSystemPrompt = `你是严谨的 MQL5 EA 局部代码编辑器。用户会提供当前完整源码、StrategySpec 和一条修改需求。

必须先输出 <mode>answer 或 modify</mode>，随后输出 <reply>；不使用 Markdown 围栏或区段外文字：
<mode>answer|modify</mode>
<reply>简短中文说明：本次只改动哪些代码块、策略影响和假设。</reply>
<spec>{修改后的完整且严格合法的 StrategySpec JSON}</spec>
<patches>[{"reason":"修改原因","search":"当前源码中连续且唯一的原始代码","replace":"替换后的代码"}]</patches>

判定规则：用户在询问当前策略的解释、原理、风险、建议，或提出与修改代码无关的一般问题时，使用 answer 并且只输出 mode 和 reply。只有用户明确要求修改、调整、应用、增加或删除当前策略/代码功能时，使用 modify 并输出全部四个区段。

硬性规则：
1. 只返回必要的 SEARCH/REPLACE 修改块，绝不返回完整源码；最多 6 个补丁。
2. 每个 search 必须逐字来自当前源码，并且在当前源码中恰好出现一次；replace 仅包含对应的替代代码。
3. 不得修改无关代码、重排格式或删除 #property strict、OnInit、OnDeinit、OnTick、指标释放、Magic Number 和错误处理。
4. spec 是事实来源；只要修改影响指标、入场、离场或风险，必须同步更新完整 spec。
5. 不使用 DLL 或 WebRequest；不承诺盈利。
6. patches 必须是严格 JSON，不能含注释、尾逗号或 Markdown。`;

const repairSystemPrompt = `你是 MQL5 编译修复工程师。根据给出的 StrategySpec、MetaEditor 编译错误和完整当前源码修复代码。
硬性规则：只修复编译错误、缺失声明、类型问题或不正确的 MQL5 API 使用；不得改变 StrategySpec 中的入场、离场、仓位和风控逻辑；不得加入 DLL 或 WebRequest；必须输出完整、可独立保存的 MQL5 EA 源码；不要输出解释、Markdown 围栏或 XML。`;

type ChatCompletionChunk = {
  choices?: Array<{ delta?: { content?: string | null } }>;
};

async function* streamCompletion(messages: AgentMessage[], systemPrompt: string, clientConfig?: ClientModelConfig): AsyncGenerator<string> {
  const config = getAgentModelConfig(clientConfig);
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: true,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(180_000),
    ...(dispatcher ? { dispatcher } : {}),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`模型服务返回 ${response.status}${detail ? `：${detail}` : ""}`);
  }
  if (!response.body) throw new Error("模型服务没有返回响应流");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = done ? "" : lines.pop() ?? "";

    for (const line of lines) {
      const payload = line.startsWith("data:") ? line.slice(5).trim() : "";
      if (!payload || payload === "[DONE]") continue;
      try {
        const chunk = JSON.parse(payload) as ChatCompletionChunk;
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch {
        // 忽略兼容服务偶发的非 JSON 心跳行。
      }
    }
    if (done) break;
  }
}

export function streamModelCompletion(messages: AgentMessage[], clientConfig?: ClientModelConfig): AsyncGenerator<string> {
  return streamCompletion(messages, agentSystemPrompt, clientConfig);
}

export function streamModificationCompletion(prompt: string, clientConfig?: ClientModelConfig): AsyncGenerator<string> {
  return streamCompletion([{ role: "user", content: prompt }], modificationSystemPrompt, clientConfig);
}

export function streamRepairCompletion(prompt: string, clientConfig?: ClientModelConfig): AsyncGenerator<string> {
  return streamCompletion([{ role: "user", content: prompt }], repairSystemPrompt, clientConfig);
}