"use client";

import { useEffect, useRef, useState } from "react";
import { inspectStrategyRisk } from "@/lib/agent/risk-check";
import { extractMql5InputParameters } from "@/lib/agent/mql5-inputs";
import type { AgentArtifact, AgentMessage, AgentStreamEvent, ClientModelConfig } from "@/lib/agent/types";
import { Mql5Editor } from "./mql5-editor";
import { Mt5InputParameters } from "./mt5-input-parameters";
import { StrategyFlow } from "./strategy-flow";

type UiMessage = AgentMessage & { id: string };
type SavedDraft = {
  id: string;
  title: string;
  artifact: AgentArtifact;
  messages: UiMessage[];
  modelMessages: AgentMessage[];
  updatedAt: string;
};
type PendingChange = {
  previousArtifact: AgentArtifact;
};

const DRAFTS_KEY = "sigma-agent-drafts-v1";
const MODEL_CONFIG_KEY = "sigma-agent-model-config-v1";
const examples = ["用 EMA20/EMA50 金叉死叉交易 EURUSD H1，单笔风险 1%", "为 XAUUSD M15 设计 RSI 超买超卖反转策略，限制交易时段", "写一个布林带突破 EA，加入点差过滤、移动止损和每日亏损上限"];
const deepSeekConfig: ClientModelConfig = { apiKey: "", endpoint: "https://api.deepseek.com/chat/completions", model: "deepseek-chat" };

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

function readModelConfig(): ClientModelConfig {
  if (typeof window === "undefined") return deepSeekConfig;
  try {
    const saved = JSON.parse(localStorage.getItem(MODEL_CONFIG_KEY) ?? "null") as Partial<ClientModelConfig> | null;
    return { apiKey: saved?.apiKey ?? "", endpoint: saved?.endpoint ?? deepSeekConfig.endpoint, model: saved?.model ?? deepSeekConfig.model };
  } catch {
    return deepSeekConfig;
  }
}

export function AgentWorkbench() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [modelMessages, setModelMessages] = useState<AgentMessage[]>([]);
  const [artifact, setArtifact] = useState<AgentArtifact | null>(null);
  const [streamedCode, setStreamedCode] = useState("");
  const [streamedReply, setStreamedReply] = useState("");
  const [status, setStatus] = useState("描述策略后开始生成");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"code" | "diagram" | "spec" | "parameters" | "compile" | "risk">("code");
  const [isGenerating, setIsGenerating] = useState(false);
  const [drafts, setDrafts] = useState<SavedDraft[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [modelConfig, setModelConfig] = useState<ClientModelConfig>(deepSeekConfig);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isDiagramReady, setIsDiagramReady] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setDrafts(readDrafts());
      setModelConfig(readModelConfig());
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), [messages, streamedReply, status]);
  useEffect(() => {
    if (!isDiagramReady) return;
    const timeout = window.setTimeout(() => setIsDiagramReady(false), 4_200);
    return () => window.clearTimeout(timeout);
  }, [isDiagramReady]);

  const displayedCode = streamedCode || artifact?.code || "// 在左侧描述策略，生成的完整 MQL5 EA 将流式显示在这里。";
  async function submit(prompt = input) {
    const content = prompt.trim();
    if (!content || isGenerating) return;
    if (!modelConfig.apiKey.trim()) {
      setError("请先在左侧“配置 AI API”中填写并保存 DeepSeek API Key。");
      setIsConfigOpen(true);
      setStatus("等待配置 DeepSeek API Key");
      return;
    }
    if (!modelConfig.endpoint.trim() || !modelConfig.model.trim()) {
      setError("请填写接口地址和模型名称后保存配置。");
      setIsConfigOpen(true);
      setStatus("AI API 配置不完整");
      return;
    }
    const userMessage: UiMessage = { id: crypto.randomUUID(), role: "user", content };
    const nextModelMessages = [...modelMessages, { role: "user" as const, content }];
    const currentStrategy = artifact ? { code: artifact.code, spec: artifact.spec, versions: artifact.versions } : undefined;
    const previousArtifact = artifact;
    setMessages((current) => [...current, userMessage]);
    setModelMessages(nextModelMessages);
    setInput("");
    setError("");
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
        body: JSON.stringify({ messages: currentStrategy ? [{ role: "user", content }] : nextModelMessages, ...(currentStrategy ? { currentStrategy, hasPendingChange: Boolean(pendingChange) } : {}), ...(modelConfig.apiKey.trim() ? { clientModel: modelConfig } : {}) }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: `请求失败 (${response.status})` })) as { error?: string };
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
        setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: finalAnswer }]);
        setModelMessages([...nextModelMessages, { role: "assistant", content: finalModelContent }]);
        setStatus("已回答问题，未修改当前策略");
        return;
      }
      if (!finalArtifact) throw new Error("生成已结束，但没有收到完整策略");

      setArtifact(finalArtifact);
      setPendingChange(finalArtifact.changes?.length && previousArtifact ? { previousArtifact } : null);
      setSelectedVersion(null);
      setIsDiagramReady(true);
      setActiveTab("code");
      setStreamedCode("");
      setStreamedReply("");
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: finalArtifact!.reply }]);
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

  function saveDraft() {
    if (!artifact) return;
    const now = new Date().toISOString();
    const id = draftId ?? crypto.randomUUID();
    const draft: SavedDraft = { id, title: artifact.spec.name, artifact, messages, modelMessages, updatedAt: now };
    const next = [draft, ...drafts.filter((item) => item.id !== id)].slice(0, 20);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
    setDrafts(next);
    setDraftId(id);
    setStatus("草稿已保存到当前浏览器");
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
    if (!artifact) return;
    try {
      await navigator.clipboard.writeText(artifact.code);
      setStatus("MQL5 代码已复制到剪贴板");
    } catch {
      setError("复制失败，请在代码编辑器中手动复制。");
    }
  }

  return (
    <div className="agent-layout">
      <aside className="agent-sidebar">
        <div><span className="agent-kicker">AI STRATEGY ARCHITECT</span><h1>MT5 策略 Agent</h1><p>通过多轮对话，把交易想法转化为结构化策略、逻辑图和可编辑的 MQL5 源码。</p></div>
        <button className="model-config-button" onClick={() => setIsConfigOpen((open) => !open)} disabled={isGenerating}><span><i className={modelConfig.apiKey ? "configured" : ""} />{modelConfig.apiKey ? modelConfig.model : "配置 AI API"}</span><b>{isConfigOpen ? "−" : "+"}</b></button>
        {isConfigOpen && <div className="model-config"><div className="model-config-heading"><b>开发者 API 配置</b><button onClick={() => { setModelConfig(deepSeekConfig); setError(""); }}>DeepSeek 预设</button></div><label>接口地址<input value={modelConfig.endpoint} onChange={(event) => setModelConfig((current) => ({ ...current, endpoint: event.target.value }))} placeholder="https://api.deepseek.com/chat/completions" /></label><label>模型<input value={modelConfig.model} onChange={(event) => setModelConfig((current) => ({ ...current, model: event.target.value }))} placeholder="deepseek-chat" /></label><label>API Key<input type="password" value={modelConfig.apiKey} onChange={(event) => setModelConfig((current) => ({ ...current, apiKey: event.target.value }))} placeholder="sk-..." autoComplete="off" /></label><div><button disabled={!modelConfig.apiKey.trim() || !modelConfig.endpoint.trim() || !modelConfig.model.trim()} onClick={() => { localStorage.setItem(MODEL_CONFIG_KEY, JSON.stringify({ ...modelConfig, endpoint: modelConfig.endpoint.trim(), model: modelConfig.model.trim(), apiKey: modelConfig.apiKey.trim() })); setModelConfig((current) => ({ ...current, endpoint: current.endpoint.trim(), model: current.model.trim(), apiKey: current.apiKey.trim() })); setIsConfigOpen(false); setError(""); setStatus("浏览器 API 配置已保存，可发送策略需求"); }}>保存配置</button><button className="clear-config" onClick={() => { setModelConfig(deepSeekConfig); localStorage.removeItem(MODEL_CONFIG_KEY); setError(""); setStatus("已清除浏览器 API 配置"); }}>清除</button></div><p>当前：{modelConfig.endpoint || "未填写"} · {modelConfig.model || "未填写"}</p><p>仅开发环境有效，Key 会保存在当前浏览器 Local Storage，绝不可在生产站使用。</p></div>}
        <button className="new-chat-button" onClick={() => { setMessages([]); setModelMessages([]); setArtifact(null); setPendingChange(null); setDraftId(null); setError(""); setStatus("已新建会话"); }} disabled={isGenerating}>＋ 新建策略</button>
        <div className="draft-list"><span>本地草稿</span>{drafts.length ? drafts.map((draft) => <button key={draft.id} className={draft.id === draftId ? "active" : ""} onClick={() => loadDraft(draft)}><b>{draft.title}</b><small>{new Date(draft.updatedAt).toLocaleString("zh-CN")}</small></button>) : <p>保存后的策略会显示在这里</p>}</div>
        <div className="agent-note">草稿目前保存在此浏览器。接入用户系统后可迁移到个人云端策略库。</div>
      </aside>

      <section className="agent-chat-panel">
        <header><div><b>需求对话</b><small>{status}</small></div><span className={isGenerating ? "agent-live active" : "agent-live"}><i />{isGenerating ? "生成中" : "就绪"}</span></header>
        <div className="agent-messages">
          {!messages.length && !streamedReply && <div className="agent-welcome"><span>Σ</span><h2>描述你的交易策略</h2><p>请尽量说明品种、周期、入场、离场和风险要求；缺失的信息会采用保守假设。</p><div>{examples.map((example) => <button key={example} onClick={() => void submit(example)}>{example}</button>)}</div></div>}
          {messages.map((message) => <article key={message.id} className={`chat-message ${message.role}`}><span>{message.role === "user" ? "你" : "AI"}</span><p>{message.content}</p></article>)}
          {streamedReply && <article className="chat-message assistant"><span>AI</span><p>{streamedReply}<i className="typing-cursor" /></p></article>}
          {error && <div className="agent-error"><b>生成失败</b><span>{error}</span></div>}
          <div ref={chatEndRef} />
        </div>
        <div className="agent-composer">
          <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} placeholder={artifact ? "继续要求修改，例如：把风险降到 0.5%，并增加移动止损…" : "描述你的策略规则…"} rows={3} disabled={isGenerating} />
          <div><small>Enter 发送 · Shift + Enter 换行</small>{isGenerating ? <button className="stop-button" onClick={() => abortRef.current?.abort()}>停止</button> : <button onClick={() => void submit()} disabled={!input.trim()}>发送 <span>↑</span></button>}</div>
        </div>
      </section>

      <section className="agent-artifact-panel">
        <header><div className="artifact-tabs"><button className={activeTab === "code" ? "active" : ""} onClick={() => setActiveTab("code")}>MQL5 代码</button><button className={`${activeTab === "diagram" ? "active" : ""} ${isDiagramReady ? "diagram-ready" : ""}`} onClick={() => { setActiveTab("diagram"); setIsDiagramReady(false); }}>逻辑图</button><button className={activeTab === "spec" ? "active" : ""} onClick={() => setActiveTab("spec")}>StrategySpec</button><button className={activeTab === "parameters" ? "active" : ""} onClick={() => setActiveTab("parameters")}>参数</button><button className={activeTab === "compile" ? "active" : ""} onClick={() => setActiveTab("compile")}>编译验证{artifact?.compilation.status === "failed" ? <em>!</em> : null}</button><button className={activeTab === "risk" ? "active" : ""} onClick={() => setActiveTab("risk")}>风险告知</button></div><div className="artifact-actions">{activeTab === "code" && <button className="copy-code-button" onClick={() => void copyCode()} disabled={!artifact || isGenerating}>复制代码</button>}<button onClick={saveDraft} disabled={!artifact || isGenerating}>保存</button><button className="download-button" onClick={downloadCode} disabled={!artifact}>下载 .mq5</button></div></header>
        <div className="artifact-content">
          {activeTab === "code" && <>{pendingChange && artifact?.changes?.length ? <div className="code-change-summary"><div><b>待确认的局部修改</b><span>主题色背景标出 {artifact.changes.length} 个已替换代码块；完整源码已重新编译验证。</span></div><div className="code-change-actions"><button onClick={confirmChanges} disabled={isGenerating}>确认修改</button><button onClick={revertChanges} disabled={isGenerating}>撤回</button></div></div> : null}<Mql5Editor value={displayedCode} onChange={updateCode} readOnly={!artifact || isGenerating} highlightedBlocks={pendingChange ? artifact?.changes?.map((change) => change.replace) : []} /></>}
          {activeTab === "diagram" && (artifact ? <StrategyFlow diagram={artifact.diagram} /> : <div className="artifact-empty">生成策略后，这里会显示由 StrategySpec 构建的执行逻辑图。</div>)}
          {activeTab === "spec" && (artifact ? <pre className="spec-view">{JSON.stringify(artifact.spec, null, 2)}</pre> : <div className="artifact-empty">尚未生成结构化策略。</div>)}
          {activeTab === "parameters" && (artifact ? <Mt5InputParameters parameters={artifact.inputParameters} /> : <div className="artifact-empty">生成策略后，这里会显示从 MQL5 源码提取的 input 参数。</div>)}
          {activeTab === "compile" && (artifact ? <div className="compile-result"><div className={`compile-summary ${artifact.compilation.status}`}><span>{artifact.compilation.status === "passed" ? "✓" : artifact.compilation.status === "failed" ? "×" : "—"}</span><div><b>{artifact.compilation.status === "passed" ? "MetaEditor 编译通过" : artifact.compilation.status === "failed" ? "MetaEditor 编译未通过" : "尚未进行编译"}</b><p>{artifact.compilation.summary}</p></div></div><div className="version-timeline"><b>编译与自动修复记录</b>{(artifact.versions?.length ? artifact.versions : [{ number: 1, kind: "generated" as const, code: artifact.code, compilation: artifact.compilation }]).map((version) => <button key={version.number} className={`${version.compilation.status} ${selectedVersion === version.number ? "selected" : ""}`} onClick={() => restoreVersion(version.number)}><span>{version.compilation.status === "passed" ? "✓" : version.compilation.status === "failed" ? "×" : "—"}</span><div><b>V{version.number} · {version.kind === "generated" ? "AI 初稿" : version.kind === "modified" ? "局部修改" : "AI 自动修复"}</b><small>{version.compilation.summary}</small></div><em>查看代码</em></button>)}</div>{artifact.compilation.status !== "unavailable" && <div className="compile-metrics"><span><b>{artifact.compilation.errors}</b> 个错误</span><span><b>{artifact.compilation.warnings}</b> 个警告</span></div>}<pre className="compile-log">{artifact.compilation.log || "当前环境未检测到可用的 Windows MetaEditor。"}</pre></div> : <div className="artifact-empty">生成完整 EA 后会自动调用本机 MetaEditor 进行编译。</div>)}
          {activeTab === "risk" && <div className="risk-list"><div className="risk-disclosure"><span>Σ</span><div><b>风险告知与使用边界</b><p>本工具根据自然语言生成策略逻辑、参数建议和 MQL5 示例代码，仅供学习、研究和开发辅助使用，不构成投资、交易或收益承诺。</p></div></div><article className="disclosure-item"><b>生成代码并未验证</b><p>代码可能存在语法、逻辑、行情数据、经纪商规则或运行环境兼容性问题。下载前请在 MetaEditor 中编译，并在模拟账户和历史数据上充分测试。</p></article><article className="disclosure-item"><b>回测不代表未来表现</b><p>历史回测会受点差、滑点、流动性、报价质量、参数拟合和市场结构变化影响，不能预测未来收益或最大回撤。</p></article><article className="disclosure-item"><b>实盘交易可能造成损失</b><p>外汇、差价合约及杠杆交易风险较高，可能导致全部本金损失。请自行决定仓位、止损和风险上限；不要将生成策略直接用于无人值守实盘交易。</p></article><article className="disclosure-item"><b>请人工审阅每次修改</b><p>特别检查下单方向、手数计算、止损止盈、交易时段、最大持仓以及任何外部访问或第三方库调用。</p></article></div>}
        </div>
        <footer><span>{artifact ? `${artifact.spec.symbol} · ${artifact.spec.timeframe} · 风险 ${artifact.spec.risk.riskPerTradePercent}%` : "等待生成"}</span><span>{artifact ? `${artifact.code.split("\n").length} 行` : "0 行"}</span></footer>
      </section>
    </div>
  );
}