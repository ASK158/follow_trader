"use client";

import { useEffect, useRef, useState } from "react";
import { createClientUuid } from "@/lib/client-id";
import { inspectStrategyRisk } from "@/lib/agent/risk-check";
import { extractMql5InputParameters } from "@/lib/agent/mql5-inputs";
import type { AgentArtifact, AgentAttachment, AgentMessage, AgentStreamEvent, StrategySpec } from "@/lib/agent/types";
import { Mql5Editor } from "./mql5-editor";
import { Mt5InputParameters } from "./mt5-input-parameters";
import { StrategyFlow } from "./strategy-flow";
import { StrategyNodeEditor } from "./strategy-node-editor";
import type { AgentBillingStatus } from "@/lib/agent/billing";

type UiMessage = AgentMessage & {
  id: string;
  attachments?: Array<Pick<AgentAttachment, "name" | "mimeType" | "kind">>;
};
type SavedDraft = {
  id: string;
  title: string;
  artifact: AgentArtifact | null;
  messages: UiMessage[];
  modelMessages: AgentMessage[];
  updatedAt: string;
};
type PendingChange = {
  previousArtifact: AgentArtifact;
  specSummary?: string;
};

const DRAFTS_KEY = "sigma-agent-drafts-v1";
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 5_000_000;
const MAX_TOTAL_ATTACHMENT_BYTES = 8_000_000;
const TEXT_DOCUMENT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv", "json", "xml", "mq4", "mq5", "mqh", "js", "jsx", "ts", "tsx", "py", "ini", "log"]);
const examples = ["用 EMA20/EMA50 金叉死叉交易 EURUSD H1，单笔风险 1%", "创建一个 MT5 自定义 RSI 背离指标，在副图绘制信号并弹窗提醒", "写一个布林带突破 EA，加入点差过滤、移动止损和每日亏损上限"];

function readDrafts(): SavedDraft[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? "[]") as SavedDraft[];
  } catch {
    return [];
  }
}

function safeFilename(name: string) {
  return `${name.trim().replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "") || "strategy"}.mq5`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`无法读取 ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function fileExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // 在 HTTP 或受限嵌入页面中，Clipboard API 可能不可用；继续使用兼容方案。
    }
  }

  if (typeof document === "undefined") throw new Error("当前环境不支持复制");
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0;";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("当前环境不支持复制");
}

function summarizeSpecChanges(previous: StrategySpec, next: StrategySpec, fallback: string): string {
  const changes: string[] = [];
  if (previous.symbol !== next.symbol) changes.push(`品种 ${previous.symbol} → ${next.symbol}`);
  if (previous.timeframe !== next.timeframe) changes.push(`周期 ${previous.timeframe} → ${next.timeframe}`);
  if (JSON.stringify(previous.indicators) !== JSON.stringify(next.indicators)) changes.push("指标或参数已调整");
  if (JSON.stringify(previous.entryRules) !== JSON.stringify(next.entryRules)) changes.push("入场条件已调整");
  if (JSON.stringify(previous.exitRules) !== JSON.stringify(next.exitRules) || JSON.stringify(previous.exitConditionTree) !== JSON.stringify(next.exitConditionTree)) changes.push("离场条件已调整");
  if (previous.risk.riskPerTradePercent !== next.risk.riskPerTradePercent) changes.push(`单笔风险 ${previous.risk.riskPerTradePercent}% → ${next.risk.riskPerTradePercent}%`);
  if (previous.risk.maxPositions !== next.risk.maxPositions) changes.push(`最大持仓 ${previous.risk.maxPositions} → ${next.risk.maxPositions}`);
  if (previous.risk.stopLoss !== next.risk.stopLoss) changes.push("止损规则已调整");
  if (previous.risk.takeProfit !== next.risk.takeProfit) changes.push("止盈规则已调整");
  if (previous.risk.sizingMethod !== next.risk.sizingMethod) changes.push("仓位算法已调整");
  return changes.length ? changes.slice(0, 5).join("；") : fallback;
}

export function AgentWorkbench({ initialBilling }: { initialBilling: AgentBillingStatus }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [modelMessages, setModelMessages] = useState<AgentMessage[]>([]);
  const [artifact, setArtifact] = useState<AgentArtifact | null>(null);
  const [streamedCode, setStreamedCode] = useState("");
  const [streamedReply, setStreamedReply] = useState("");
  const [status, setStatus] = useState("描述策略后开始生成");
  const [error, setError] = useState("");
  const [errorTitle, setErrorTitle] = useState("生成失败");
  const [copyNotice, setCopyNotice] = useState(false);
  const [activeTab, setActiveTab] = useState<"code" | "diagram" | "spec" | "parameters" | "compile" | "risk">("code");
  const [isGenerating, setIsGenerating] = useState(false);
  const [drafts, setDrafts] = useState<SavedDraft[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [isDiagramReady, setIsDiagramReady] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [billing, setBilling] = useState(initialBilling);
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const copyNoticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setDrafts(readDrafts());
      localStorage.removeItem("sigma-agent-model-config-v1");
    });
    void fetch("/api/agent/drafts").then((response) => response.ok ? response.json() : null).then((result) => {
      if (result?.drafts) setDrafts(result.drafts as SavedDraft[]);
    }).catch(() => undefined);
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamedReply, status]);
  useEffect(() => {
    if (!isDiagramReady) return;
    const timeout = window.setTimeout(() => setIsDiagramReady(false), 4_200);
    return () => window.clearTimeout(timeout);
  }, [isDiagramReady]);
  useEffect(() => () => {
    if (copyNoticeTimerRef.current !== null) window.clearTimeout(copyNoticeTimerRef.current);
  }, []);

  const displayedCode = streamedCode || artifact?.code || "// 在左侧描述需求，生成的完整 MQL5 EA 或自定义指标将流式显示在这里。";
  async function addFiles(files: File[]) {
    if (!files.length || isGenerating) return;
    setError("");
    setErrorTitle("附件处理失败");
    const availableSlots = MAX_ATTACHMENTS - attachments.length;
    if (availableSlots <= 0) {
      setError(`每次最多发送 ${MAX_ATTACHMENTS} 个附件`);
      return;
    }
    const selected = files.slice(0, availableSlots);
    if (selected.some((file) => file.size > MAX_ATTACHMENT_BYTES)) {
      setError("单个附件不能超过 5 MB");
      return;
    }
    if (attachments.reduce((total, item) => total + item.size, 0) + selected.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_ATTACHMENT_BYTES) {
      setError("本次附件总大小不能超过 8 MB");
      return;
    }
    try {
      const next = await Promise.all(selected.map(async (file): Promise<AgentAttachment> => {
        const kind = file.type.startsWith("image/") ? "image" : "document";
        const isText = kind === "document" && (file.type.startsWith("text/") || TEXT_DOCUMENT_EXTENSIONS.has(fileExtension(file.name)));
        const mimeType = file.type || (isText ? "text/plain" : "application/octet-stream");
        return {
          id: createClientUuid(),
          name: file.name,
          mimeType,
          size: file.size,
          kind,
          encoding: isText ? "text" : "data-url",
          data: isText ? await file.text() : await readAsDataUrl(file),
        };
      }));
      setAttachments((current) => [...current, ...next]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "附件读取失败");
    }
  }

  async function submit(prompt = input, requestedSpec?: StrategySpec, specSummary?: string) {
    const selectedAttachments = requestedSpec ? [] : attachments;
    const content = prompt.trim() || (selectedAttachments.length ? "请分析附件内容，并结合其中的信息回答或创建策略。" : "");
    if (!content || isGenerating) return;
    const attachmentMetadata = selectedAttachments.map(({ name, mimeType, kind }) => ({ name, mimeType, kind }));
    const userMessage: UiMessage = { id: createClientUuid(), role: "user", content, ...(attachmentMetadata.length ? { attachments: attachmentMetadata } : {}) };
    const nextModelMessages = [...modelMessages, { role: "user" as const, content }];
    const currentStrategy = artifact ? { code: artifact.code, spec: artifact.spec, versions: artifact.versions } : undefined;
    const previousArtifact = artifact;
    setMessages((current) => [...current, userMessage]);
    setModelMessages(nextModelMessages);
    setInput("");
    setAttachments([]);
    setError("");
    setErrorTitle("生成失败");
    setStreamedCode("");
    setStreamedReply("");
    setStatus("正在连接 AI Agent…");
    setIsGenerating(true);
    setDraftId(null);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: createClientUuid(), messages: currentStrategy ? [{ role: "user", content }] : nextModelMessages, ...(selectedAttachments.length ? { attachments: selectedAttachments } : {}), ...(currentStrategy ? { currentStrategy, hasPendingChange: Boolean(pendingChange), requestedSpec } : {}) }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: `请求失败 (${response.status})` })) as { error?: string; billing?: AgentBillingStatus };
        if (body.billing) setBilling(body.billing);
        throw new Error(body.error || `请求失败 (${response.status})`);
      }
      if (!response.body) throw new Error("服务端未返回响应流");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalArtifact: AgentArtifact | null = null;
      let finalAnswer = "";
      let finalModelContent = "";
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = done ? "" : lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as AgentStreamEvent;
          if (event.type === "status") setStatus(event.message);
          if (event.type === "billing") setBilling({ freeRemaining: event.freeRemaining, freeEligible: event.freeEligible, gasBalance: event.gasBalance, isAdmin: event.isAdmin, pricing: event.pricing });
          if (event.type === "reply-delta") setStreamedReply((current) => current + event.delta);
          if (event.type === "code-delta") {
            setStreamedCode((current) => current + event.delta);
            setStatus("正在生成 MQL5 代码…");
          }
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "answer") {
            finalAnswer = event.reply;
            finalModelContent = event.modelContent;
          }
          if (event.type === "artifact") {
            finalArtifact = event.artifact;
            finalModelContent = event.modelContent;
          }
        }
        if (done) break;
      }
      if (finalAnswer) {
        setStreamedCode("");
        setStreamedReply("");
        setMessages((current) => [...current, { id: createClientUuid(), role: "assistant", content: finalAnswer }]);
        setModelMessages([...nextModelMessages, { role: "assistant", content: finalModelContent }]);
        setStatus("已回答问题，未修改当前策略");
        return;
      }
      if (!finalArtifact) throw new Error("生成已结束，但没有收到完整策略");

      setArtifact(finalArtifact);
      setPendingChange(finalArtifact.changes?.length && previousArtifact ? { previousArtifact, specSummary } : null);
      setSelectedVersion(null);
      setSelectedNodeId(null);
      setIsDiagramReady(true);
      setActiveTab("code");
      setStreamedCode("");
      setStreamedReply("");
      setMessages((current) => [...current, { id: createClientUuid(), role: "assistant", content: finalArtifact!.reply }]);
      setModelMessages([...nextModelMessages, { role: "assistant", content: finalModelContent }]);
      setStatus(finalArtifact.changes?.length ? `已局部更新 ${finalArtifact.changes.length} 个代码块，并完成策略验证` : "策略、代码和逻辑图已生成");
    } catch (caught) {
      if (controller.signal.aborted) {
        setStatus("生成已停止");
      } else {
        setError(caught instanceof Error ? caught.message : "生成失败，请稍后重试");
        setStatus("生成失败");
      }
    } finally {
      abortRef.current = null;
      setIsGenerating(false);
    }
  }

  function updateCode(code = "") {
    if (!artifact) return;
    setArtifact({ ...artifact, code, risks: inspectStrategyRisk(artifact.spec, code) });
  }

  function confirmChanges() {
    if (!pendingChange) return;
    setPendingChange(null);
    setStatus("已确认本次局部代码修改。");
  }

  function submitDiagramChange(nextSpec: StrategySpec, summary: string) {
    if (!artifact || isGenerating || pendingChange) return;
    if (JSON.stringify(artifact.spec) === JSON.stringify(nextSpec)) {
      setStatus("节点内容没有变化，无需生成代码修改。");
      setSelectedNodeId(null);
      return;
    }
    const changeSummary = summarizeSpecChanges(artifact.spec, nextSpec, summary);
    const prompt = `请将策略规格更新为我在逻辑图中提交的目标规格。修改范围：${changeSummary}。必须严格以随请求提供的目标 StrategySpec 为准，仅对当前 MQL5 代码做必要的局部修改，并保留其他手动代码。`;
    void submit(prompt, nextSpec, changeSummary);
  }

  function revertChanges() {
    if (!pendingChange) return;
    setArtifact(pendingChange.previousArtifact);
    setPendingChange(null);
    setSelectedVersion(null);
    setStatus("已撤回本次局部修改，恢复到修改前的策略状态。");
  }

  function restoreVersion(versionNumber: number) {
    if (!artifact) return;
    const version = artifact.versions?.find((item) => item.number === versionNumber);
    if (!version) return;
    setArtifact({ ...artifact, code: version.code, compilation: version.compilation, risks: inspectStrategyRisk(artifact.spec, version.code), inputParameters: extractMql5InputParameters(version.code) });
    setPendingChange(null);
    setSelectedVersion(versionNumber);
    setActiveTab("code");
    setStatus(`已恢复到 V${versionNumber}，可继续编辑或下载。`);
  }

  async function saveDraft() {
    if (!artifact && !messages.length) return;
    const now = new Date().toISOString();
    const id = draftId ?? createClientUuid();
    const firstUserMessage = messages.find((message) => message.role === "user")?.content;
    const title = artifact?.spec.name ?? firstUserMessage?.slice(0, 36) ?? "Agent 对话";
    const draft: SavedDraft = { id, title, artifact, messages, modelMessages, updatedAt: now };
    const next = [draft, ...drafts.filter((item) => item.id !== id)].slice(0, 20);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
    setDrafts(next);
    setDraftId(id);
    try {
      const response = await fetch("/api/agent/drafts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      if (!response.ok) throw new Error();
      setStatus("当前对话与代码已保存到浏览器，并同步到个人云端策略库");
    } catch {
      setStatus("当前对话与代码已保存在当前浏览器；云端同步失败");
    }
  }

  function loadDraft(draft: SavedDraft) {
    if (isGenerating) return;
    setArtifact(draft.artifact);
    setMessages(draft.messages);
    setModelMessages(draft.modelMessages);
    setPendingChange(null);
    setDraftId(draft.id);
    setError("");
    setStatus(`已打开：${draft.title}`);
  }

  function downloadCode() {
    if (!artifact) return;
    const url = URL.createObjectURL(new Blob([artifact.code], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = safeFilename(artifact.spec.name);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyCode() {
    if (!artifact?.code) return;
    try {
      await copyTextToClipboard(artifact.code);
      setError("");
      setStatus("MQL5 代码已复制到剪贴板");
      setCopyNotice(true);
      if (copyNoticeTimerRef.current !== null) window.clearTimeout(copyNoticeTimerRef.current);
      copyNoticeTimerRef.current = window.setTimeout(() => {
        setCopyNotice(false);
        copyNoticeTimerRef.current = null;
      }, 2_200);
    } catch {
      setErrorTitle("复制失败");
      setError("复制失败，请在代码编辑器中手动复制。");
    }
  }

  return (
    <div className="agent-layout">
      {copyNotice && <div className="agent-copy-toast" role="status" aria-live="polite">复制代码成功</div>}
      <aside className="agent-sidebar">
        <div><span className="agent-kicker">AI MQL5 ARCHITECT</span><h1>MT5 程序 Agent</h1><p>通过多轮对话，把交易想法转化为结构化 EA 或自定义指标、逻辑图和可编辑的 MQL5 源码。</p></div>
        <div className="agent-billing-card"><span>{billing.isAdmin ? "管理员免计费" : billing.freeEligible ? `免费 ${billing.freeRemaining}/${billing.pricing.freeUsageLimit} 次 · ${billing.gasBalance} Gas` : `无免费额度 · ${billing.gasBalance} Gas`}</span><small>{billing.isAdmin ? "调用仍会记录用量与审计" : `对话 ${billing.pricing.chatCost} · 修改 ${billing.pricing.modifyCost} · 完整生成 ${billing.pricing.generateCost} Gas；免费用尽后需至少 ${billing.pricing.minimumGasToStart} Gas 才能发起`}</small></div>
        <button className="new-chat-button" onClick={() => { setMessages([]); setModelMessages([]); setArtifact(null); setPendingChange(null); setSelectedNodeId(null); setDraftId(null); setAttachments([]); setError(""); setStatus("已新建会话"); }} disabled={isGenerating}>＋ 新建对话</button>
        <div className="draft-list"><span>我的云端草稿</span>{drafts.length ? drafts.map((draft) => <button key={draft.id} className={draft.id === draftId ? "active" : ""} onClick={() => loadDraft(draft)}><b>{draft.title}</b><small>{new Date(draft.updatedAt).toLocaleString("zh-CN")}</small></button>) : <p>保存后的策略会显示在这里</p>}</div>
        <div className="agent-note">草稿与当前账户同步；浏览器中同时保留离线副本。</div>
      </aside>

      <section className="agent-chat-panel">
        <header><div><b>需求对话</b><small>{status}</small></div><span className={isGenerating ? "agent-live active" : "agent-live"}><i />{isGenerating ? "生成中" : "就绪"}</span></header>
        <div className="agent-messages">
          {!messages.length && !streamedReply && <div className="agent-welcome"><span>Σ</span><h2>描述你的 EA 或指标</h2><p>请先说明要生成 EA 还是自定义指标，并尽量写明品种、周期、规则、显示方式或风险要求。</p><div>{examples.map((example) => <button key={example} onClick={() => void submit(example)}>{example}</button>)}</div></div>}
          {messages.map((message) => <article key={message.id} className={`chat-message ${message.role}`}><span>{message.role === "user" ? "你" : "AI"}</span><div className="chat-message-body"><p>{message.content}</p>{message.attachments?.length ? <div className="message-attachments">{message.attachments.map((item, index) => <span key={`${item.name}-${index}`}>{item.kind === "image" ? "▧" : "▤"} {item.name}</span>)}</div> : null}</div></article>)}
          {streamedReply && <article className="chat-message assistant"><span>AI</span><p>{streamedReply}<i className="typing-cursor" /></p></article>}
          {error && <div className="agent-error"><b>{errorTitle}</b><span>{error}</span></div>}
          <div ref={chatEndRef} />
        </div>
        <div className="agent-composer">
          <div className="composer-toolbar"><button type="button" className="attachment-button" onClick={() => fileInputRef.current?.click()} disabled={isGenerating || attachments.length >= MAX_ATTACHMENTS}>＋ 图片/文档</button><button type="button" className="save-conversation-button" onClick={() => void saveDraft()} disabled={(!artifact && !messages.length) || isGenerating}>保存当前对话</button><input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.doc,.docx,.txt,.md,.csv,.json,.xml,.mq4,.mq5,.mqh,.js,.ts,.py" multiple hidden onChange={(event) => { void addFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} /></div>
          {attachments.length ? <div className="composer-attachments">{attachments.map((item) => <div key={item.id}>{item.kind === "image" ? <span className="attachment-image-preview" style={{ backgroundImage: `url(${item.data})` }} /> : <span>DOC</span>}<b title={item.name}>{item.name}</b><button type="button" aria-label={`移除 ${item.name}`} onClick={() => setAttachments((current) => current.filter((attachment) => attachment.id !== item.id))}>×</button></div>)}</div> : null}
          <textarea value={input} onChange={(event) => setInput(event.target.value)} onPaste={(event) => { const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/")); if (images.length) { event.preventDefault(); void addFiles(images); } }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} placeholder={artifact ? "继续要求修改，也可粘贴截图或附加文档…" : "描述策略规则，或粘贴截图/附加文档…"} rows={3} disabled={isGenerating} />
          <div className="composer-footer"><small>Enter 发送 · Shift + Enter 换行 · 支持粘贴截图</small>{isGenerating ? <button className="stop-button" onClick={() => abortRef.current?.abort()}>停止</button> : <button onClick={() => void submit()} disabled={!input.trim() && !attachments.length}>发送 <span>↑</span></button>}</div>
        </div>
      </section>

      <section className="agent-artifact-panel">
        <header><div className="artifact-tabs"><button className={activeTab === "code" ? "active" : ""} onClick={() => setActiveTab("code")}>MQL5 代码</button><button className={`${activeTab === "diagram" ? "active" : ""} ${isDiagramReady ? "diagram-ready" : ""}`} onClick={() => { setActiveTab("diagram"); setIsDiagramReady(false); }}>逻辑图</button><button className={activeTab === "parameters" ? "active" : ""} onClick={() => setActiveTab("parameters")}>参数</button><button className={activeTab === "compile" ? "active" : ""} onClick={() => setActiveTab("compile")}>编译验证{artifact?.compilation.status === "failed" ? <em>!</em> : null}</button><button className={activeTab === "risk" ? "active" : ""} onClick={() => setActiveTab("risk")}>风险告知</button><button className={activeTab === "spec" ? "active" : ""} onClick={() => setActiveTab("spec")}>StrategySpec</button></div><div className="artifact-actions">{activeTab === "code" && <button className="copy-code-button" onClick={() => void copyCode()} disabled={!artifact || isGenerating}>复制代码</button>}<button className="download-button" onClick={downloadCode} disabled={!artifact}>下载 .mq5</button></div></header>
        <div className="artifact-content">
          {activeTab === "code" && <>{pendingChange && artifact?.changes?.length ? <div className="code-change-summary"><div><b>待确认的局部修改{pendingChange.specSummary ? ` · ${pendingChange.specSummary}` : ""}</b><span>主题色背景标出 {artifact.changes.length} 个已替换代码块；完整源码已重新编译验证。</span></div><div className="code-change-actions"><button onClick={confirmChanges} disabled={isGenerating}>确认修改</button><button onClick={revertChanges} disabled={isGenerating}>撤回</button></div></div> : null}<Mql5Editor value={displayedCode} onChange={updateCode} readOnly={!artifact || isGenerating} highlightedBlocks={pendingChange ? artifact?.changes?.map((change) => change.replace) : []} /></>}
          {activeTab === "diagram" && (artifact ? <div className={`strategy-diagram-editor ${selectedNodeId ? "editing" : ""}`}><StrategyFlow diagram={artifact.diagram} selectedNodeId={selectedNodeId} disabled={isGenerating || Boolean(pendingChange)} onNodeSelect={setSelectedNodeId} />{selectedNodeId && artifact.diagram.nodes.find((node) => node.id === selectedNodeId) ? <StrategyNodeEditor key={selectedNodeId} spec={artifact.spec} node={artifact.diagram.nodes.find((node) => node.id === selectedNodeId)!} disabled={isGenerating} onClose={() => setSelectedNodeId(null)} onSubmit={submitDiagramChange} /> : null}{pendingChange && <div className="diagram-locked-note">当前有待确认的代码修改，请先在“MQL5 代码”页确认或撤回。</div>}</div> : <div className="artifact-empty">生成程序后，这里会显示由 StrategySpec 构建的执行逻辑图。</div>)}
          {activeTab === "spec" && (artifact ? <pre className="spec-view">{JSON.stringify(artifact.spec, null, 2)}</pre> : <div className="artifact-empty">尚未生成结构化策略。</div>)}
          {activeTab === "parameters" && (artifact ? <Mt5InputParameters parameters={artifact.inputParameters} /> : <div className="artifact-empty">生成策略后，这里会显示从 MQL5 源码提取的 input 参数。</div>)}
          {activeTab === "compile" && (artifact ? <div className="compile-result"><div className={`compile-summary ${artifact.compilation.status}`}><span>{artifact.compilation.status === "passed" ? "✓" : artifact.compilation.status === "failed" ? "×" : "—"}</span><div><b>{artifact.compilation.status === "passed" ? "MetaEditor 编译通过" : artifact.compilation.status === "failed" ? "MetaEditor 编译未通过" : "尚未进行编译"}</b><p>{artifact.compilation.summary}</p></div></div><div className="version-timeline"><b>编译与自动修复记录</b>{(artifact.versions?.length ? artifact.versions : [{ number: 1, kind: "generated" as const, code: artifact.code, compilation: artifact.compilation }]).map((version) => <button key={version.number} className={`${version.compilation.status} ${selectedVersion === version.number ? "selected" : ""}`} onClick={() => restoreVersion(version.number)}><span>{version.compilation.status === "passed" ? "✓" : version.compilation.status === "failed" ? "×" : "—"}</span><div><b>V{version.number} · {version.kind === "generated" ? "AI 初稿" : version.kind === "modified" ? "局部修改" : "AI 自动修复"}</b><small>{version.compilation.summary}</small></div><em>查看代码</em></button>)}</div>{artifact.compilation.status !== "unavailable" && <div className="compile-metrics"><span><b>{artifact.compilation.errors}</b> 个错误</span><span><b>{artifact.compilation.warnings}</b> 个警告</span></div>}<pre className="compile-log">{artifact.compilation.log || "当前环境未检测到可用的 Windows MetaEditor。"}</pre></div> : <div className="artifact-empty">生成完整 MQL5 程序后会自动调用本机 MetaEditor 进行编译。</div>)}
          {activeTab === "risk" && <div className="risk-list"><div className="risk-disclosure"><span>Σ</span><div><b>风险告知与使用边界</b><p>本工具根据自然语言生成策略逻辑、参数建议和 MQL5 示例代码，仅供学习、研究和开发辅助使用，不构成投资、交易或收益承诺。</p></div></div><article className="disclosure-item"><b>生成代码并未验证</b><p>代码可能存在语法、逻辑、行情数据、经纪商规则或运行环境兼容性问题。下载前请在 MetaEditor 中编译，并在模拟账户和历史数据上充分测试。</p></article><article className="disclosure-item"><b>回测不代表未来表现</b><p>历史回测会受点差、滑点、流动性、报价质量、参数拟合和市场结构变化影响，不能预测未来收益或最大回撤。</p></article><article className="disclosure-item"><b>实盘交易可能造成损失</b><p>外汇、差价合约及杠杆交易风险较高，可能导致全部本金损失。请自行决定仓位、止损和风险上限；不要将生成策略直接用于无人值守实盘交易。</p></article><article className="disclosure-item"><b>请人工审阅每次修改</b><p>特别检查下单方向、手数计算、止损止盈、交易时段、最大持仓以及任何外部访问或第三方库调用。</p></article></div>}
        </div>
        <footer><span>{artifact ? artifact.spec.programType === "custom-indicator" ? `${artifact.spec.symbol} · ${artifact.spec.timeframe} · 自定义指标` : `${artifact.spec.symbol} · ${artifact.spec.timeframe} · 风险 ${artifact.spec.risk.riskPerTradePercent}%` : "等待生成"}</span><span>{artifact ? `${artifact.code.split("\n").length} 行` : "0 行"}</span></footer>
      </section>
    </div>
  );
}