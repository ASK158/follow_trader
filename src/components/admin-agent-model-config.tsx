"use client";

import { useState } from "react";
import type { AdminAgentModelConfig as AgentModelConfig } from "@/lib/agent/model-config";

export function AdminAgentModelConfig({ initialConfig }: { initialConfig: AgentModelConfig }) {
  const [config, setConfig] = useState(initialConfig);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setError(""); setNotice("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const apiKey = String(form.get("apiKey") ?? "").trim();
    try {
      const response = await fetch("/api/admin/agent-model-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(apiKey ? { apiKey } : {}),
          endpoint: String(form.get("endpoint") ?? "").trim(),
          model: String(form.get("model") ?? "").trim(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "AI 配置保存失败");
      setConfig(result.config);
      (formElement.elements.namedItem("apiKey") as HTMLInputElement).value = "";
      setNotice("连接验证通过，AI 配置已加密保存并立即生效。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 配置保存失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="finance-settings-card" aria-labelledby="agent-model-config-title">
      <div><span className="panel-code">SERVER-SIDE AI PROVIDER</span><h2 id="agent-model-config-title">AI 实验室 API 配置</h2><p>保存前会从服务器验证 API。密钥使用 AES-256-GCM 加密，只保存在服务端，不会回显到浏览器。</p></div>
      <form className="finance-settings-form" onSubmit={save}>
        <fieldset><legend>模型服务</legend><div className="dev-form-grid">
          <label>API Key<input name="apiKey" type="password" autoComplete="new-password" maxLength={500} placeholder={config.apiKeyConfigured ? "已配置；留空表示保持不变" : "请输入 API Key"} required={!config.apiKeyConfigured} /><small>当前来源：{config.source === "admin" ? "管理员后台加密配置" : config.source === "environment" ? "服务器环境变量" : "尚未配置"}</small></label>
          <label>Chat Completions API 地址<input name="endpoint" type="url" maxLength={500} defaultValue={config.endpoint} pattern="https://.*" required /><small>必须是兼容 OpenAI Chat Completions 的 HTTPS 地址。</small></label>
          <label>模型名称<input name="model" type="text" minLength={1} maxLength={120} defaultValue={config.model} placeholder="deepseek-chat" required /></label>
        </div></fieldset>
        {error && <p className="dev-form-error" role="alert">{error}</p>}
        {notice && <p className="dev-notice" role="status">{notice}</p>}
        <button type="submit" disabled={pending}>{pending ? "正在验证并保存…" : "验证并保存 AI 配置"}</button>
      </form>
    </section>
  );
}
