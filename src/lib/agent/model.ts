import "server-only";
import type { AgentAttachment, AgentMessage, AgentProgramType } from "./types";
import { getAgentModelConfig } from "./model-config";
import { fetchAgentProvider } from "./provider";

export { getAgentModelConfig } from "./model-config";

export const agentSystemPrompt = `你是熟悉 MT5、MQL5、量化策略与技术指标开发的中文助手。你既能解答一般问题，也能根据创建需求生成结构明确、可审查的 MT5 Expert Advisor 或 MQL5 自定义指标。

必须先只输出 <mode>answer 或 create</mode>，随后输出 <reply>。不要使用 Markdown 代码围栏，不要在区段外输出文字：
<mode>answer|create</mode>
<reply>给用户的简短中文说明，指出本轮实现内容、关键假设和仍需确认的问题。</reply>
<spec>{严格 JSON}</spec>
<code>完整可独立保存的 MQL5 源码</code>

判定规则：
1. 询问概念、代码解释、使用方法、风险、比较、建议或其他非明确创建程序的问题，使用 answer：只输出 mode 和 reply，不输出 spec 或 code。
2. 用户明确要求创建、编写、生成新的策略、EA、技术指标、自定义指标或 MQL5 代码时，使用 create：必须输出全部四个区段。
3. 对无法确认是否要创建代码的请求，优先使用 answer 追问或说明，不要擅自生成代码。

spec JSON 必须严格满足这个结构：
{
  "programType": "expert-advisor",
  "name": "不超过80字",
  "summary": "策略摘要",
  "symbol": "交易品种或 CURRENT",
  "timeframe": "例如 H1",
  "strategyType": "策略类型",
  "indicators": [{"id":"唯一英文ID","name":"指标名","parameters":{"period":20}}],
  "entryRules": [{"id":"稳定唯一ID","side":"long|short|both","conditions":["完整条件"],"conditionTree":{"id":"group-id","kind":"group","operator":"and|or","children":[{"id":"condition-id","kind":"condition","expression":"完整条件"}]}}],
  "exitRules": ["完整离场条件"],
  "exitConditionTree": {"id":"exit-group","kind":"group","operator":"and|or","children":[{"id":"exit-condition","kind":"condition","expression":"完整离场条件"}]},
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
1. spec 是事实来源，代码必须与 spec 一致；信息不足时采用保守假设并写入 assumptions。
programType 只允许 expert-advisor 或 custom-indicator，必须根据用户要求选择其一。
2. EA 的 programType 必须为 expert-advisor；生成完整 EA，包含 #property strict、OnInit、OnDeinit、OnTick、指标句柄释放、Magic Number、输入参数和错误处理。
3. 自定义指标的 programType 必须为 custom-indicator；生成完整指标，包含适当的 #property indicator_* 声明、指标缓冲区、OnInit、OnDeinit、OnCalculate、输入参数、数组边界保护和错误处理；不得包含下单逻辑。指标必须设置 entryRules=[]、exitRules=[]，并且完全省略 exitConditionTree 以及所有 entryRules.conditionTree；risk 必须设置 riskPerTradePercent=0、maxPositions=0，其他不适用的 risk 文本字段填写“不适用（指标不执行交易）”。
4. EA 默认使用按止损距离计算的风险仓位；默认单笔风险不超过 1%，maxPositions 必须是 1 到 100 的整数，默认最多一个同品种持仓。指标的 maxPositions 必须为整数 0。
5. 不使用 DLL 或 WebRequest；不承诺盈利。
6. EA 的 conditionTree 和 exitConditionTree 用于表达 AND/OR 嵌套，最多嵌套 3 层；conditions 和 exitRules 必须同步保存条件树中的全部叶子条件。指标不得输出 conditionTree 或 exitConditionTree 字段，不能输出 null、空对象或空数组作为占位值。
7. JSON 内不得出现注释、尾逗号、NaN 或 Markdown。`;

const modificationSystemPrompt = `你是严谨的 MQL5 EA 与自定义指标局部代码编辑器。用户会提供当前完整源码、StrategySpec 和一条修改需求。

必须先输出 <mode>answer 或 modify</mode>，随后输出 <reply>；不使用 Markdown 围栏或区段外文字：
<mode>answer|modify</mode>
<reply>简短中文说明：本次只改动哪些代码块、策略影响和假设。</reply>
<spec>{修改后的完整且严格合法的 StrategySpec JSON}</spec>
<patches>[{"reason":"修改原因","search":"当前源码中连续且唯一的原始代码","replace":"替换后的代码"}]</patches>

判定规则：用户在询问当前策略的解释、原理、风险、建议，或提出与修改代码无关的一般问题时，使用 answer 并且只输出 mode 和 reply。只有用户明确要求修改、调整、应用、增加或删除当前策略/代码功能时，使用 modify 并输出全部四个区段。

硬性规则：
1. 只返回必要的 SEARCH/REPLACE 修改块，绝不返回完整源码；最多 6 个补丁。
2. 每个 search 必须逐字来自当前源码，并且在当前源码中恰好出现一次；replace 仅包含对应的替代代码。
3. 不得修改无关代码或重排格式；EA 不得删除 #property strict、OnInit、OnDeinit、OnTick、指标释放、Magic Number 和错误处理；自定义指标不得删除指标属性、缓冲区声明、OnInit、OnDeinit、OnCalculate 和错误处理。
4. spec 是事实来源；只要修改影响指标、入场、离场或风险，必须同步更新完整 spec。
5. 不使用 DLL 或 WebRequest；不承诺盈利。
6. conditionTree 和 exitConditionTree 用于表达 AND/OR 嵌套，最多嵌套 3 层；conditions 和 exitRules 必须同步保存条件树中的全部叶子条件，兼容代码与摘要展示。
7. patches 必须是严格 JSON，不能含注释、尾逗号或 Markdown。`;

function repairSystemPrompt(programType: AgentProgramType): string {
  const target = programType === "custom-indicator"
    ? "MQL5 自定义指标；必须保留指标属性、缓冲区、OnInit、OnDeinit 与 OnCalculate，不得增加下单逻辑"
    : "MT5 Expert Advisor；必须保留 OnInit、OnDeinit、OnTick、Magic Number 与交易风控";
  return `你是 MQL5 编译修复工程师。根据给出的 StrategySpec、MetaEditor 编译错误和完整当前源码修复代码。
目标程序是${target}。
硬性规则：只修复编译错误、缺失声明、类型问题或不正确的 MQL5 API 使用；不得改变 StrategySpec 的业务逻辑；不得加入 DLL 或 WebRequest；必须输出完整、可独立保存的 MQL5 源码；不要输出解释、Markdown 围栏或 XML。`;
}

type ChatCompletionChunk = {
  choices?: Array<{ delta?: { content?: string | null } }>;
};

type ModelMessage = {
  role: "user" | "assistant";
  content: string | Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
    | { type: "file"; file: { filename: string; file_data: string } }
  >;
};

function withAttachments(messages: AgentMessage[], attachments: AgentAttachment[]): ModelMessage[] {
  if (!attachments.length) return messages;
  const lastUserIndex = messages.findLastIndex((message) => message.role === "user");
  return messages.map((message, index) => {
    if (index !== lastUserIndex) return message;
    const content: ModelMessage["content"] = [{ type: "text", text: message.content }];
    for (const attachment of attachments) {
      if (attachment.kind === "image") {
        content.push({ type: "image_url", image_url: { url: attachment.data } });
      } else if (attachment.encoding === "text") {
        content.push({ type: "text", text: `\n<attached_document name="${attachment.name}">\n${attachment.data}\n</attached_document>` });
      } else {
        content.push({ type: "file", file: { filename: attachment.name, file_data: attachment.data } });
      }
    }
    return { ...message, content };
  });
}

export type AgentModelRequestContext = { signal?: AbortSignal; requestId?: string; conversationId?: string | null; userId?: string };

async function* streamCompletion(messages: AgentMessage[], systemPrompt: string, attachments: AgentAttachment[] = [], context: AgentModelRequestContext = {}): AsyncGenerator<string> {
  const config = getAgentModelConfig();
  const response = await fetchAgentProvider({
    endpoint: config.endpoint,
    model: config.model,
    apiKey: config.apiKey,
    signal: context.signal,
    requestId: context.requestId,
    conversationId: context.conversationId,
    userId: context.userId,
    body: {
      model: config.model,
      messages: [{ role: "system", content: systemPrompt }, ...withAttachments(messages, attachments)],
      stream: true,
      temperature: 0.2,
    },
  });

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

export function streamModelCompletion(messages: AgentMessage[], attachments: AgentAttachment[] = [], context: AgentModelRequestContext = {}): AsyncGenerator<string> {
  return streamCompletion(messages, agentSystemPrompt, attachments, context);
}

export function streamModificationCompletion(prompt: string, attachments: AgentAttachment[] = [], context: AgentModelRequestContext = {}): AsyncGenerator<string> {
  return streamCompletion([{ role: "user", content: prompt }], modificationSystemPrompt, attachments, context);
}

export function streamRepairCompletion(prompt: string, programType: AgentProgramType, context: AgentModelRequestContext = {}): AsyncGenerator<string> {
  return streamCompletion([{ role: "user", content: prompt }], repairSystemPrompt(programType), [], context);
}