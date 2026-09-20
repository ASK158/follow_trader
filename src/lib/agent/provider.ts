import "server-only";
import { createHash } from "node:crypto";
import { ProxyAgent, fetch } from "undici";
import { getMarketplaceDb } from "@/lib/marketplace/db";
import { recordAgentEvent } from "./metrics";

const proxyUrl = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
const failureThreshold = Math.max(2, Number(process.env.AGENT_PROVIDER_CIRCUIT_FAILURES ?? 5));
const openMs = Math.max(10_000, Number(process.env.AGENT_PROVIDER_CIRCUIT_OPEN_MS ?? 60_000));
const attemptTimeoutMs = Math.max(10_000, Number(process.env.AGENT_PROVIDER_TIMEOUT_MS ?? 60_000));
const maxAttempts = Math.max(1, Math.min(4, Number(process.env.AGENT_PROVIDER_MAX_ATTEMPTS ?? 3)));

export class AgentProviderUnavailableError extends Error {}

function circuitKey(endpoint: string, model: string): string {
  return createHash("sha256").update(`${endpoint}|${model}`).digest("hex");
}

function claimCircuit(key: string): void {
  const db = getMarketplaceDb();
  const now = Date.now();
  db.transaction(() => {
    db.prepare("INSERT OR IGNORE INTO agent_provider_circuits (circuit_key, updated_at) VALUES (?, ?)").run(key, new Date().toISOString());
    const row = db.prepare("SELECT state, opened_until, probe_started_at FROM agent_provider_circuits WHERE circuit_key = ?").get(key) as { state: "closed" | "open" | "half-open"; opened_until: number | null; probe_started_at: number | null } | undefined;
    if (!row) throw new AgentProviderUnavailableError("无法初始化 AI 服务熔断器");
    if (row.state === "open") {
      if ((row.opened_until ?? 0) > now) throw new AgentProviderUnavailableError("AI 服务暂时不可用，熔断保护已开启，请稍后重试");
      const claimed = db.prepare("UPDATE agent_provider_circuits SET state = 'half-open', probe_started_at = ?, updated_at = ? WHERE circuit_key = ? AND state = 'open' AND opened_until <= ?").run(now, new Date().toISOString(), key, now);
      if (claimed.changes !== 1) throw new AgentProviderUnavailableError("AI 服务正在恢复探测，请稍后重试");
      return;
    }
    if (row.state === "half-open") throw new AgentProviderUnavailableError("AI 服务正在恢复探测，请稍后重试");
  })();
}

function markSuccess(key: string): void {
  getMarketplaceDb().prepare("UPDATE agent_provider_circuits SET state = 'closed', failure_count = 0, opened_until = NULL, probe_started_at = NULL, updated_at = ? WHERE circuit_key = ?").run(new Date().toISOString(), key);
}

function markFailure(key: string): void {
  const db = getMarketplaceDb();
  db.transaction(() => {
    db.prepare("UPDATE agent_provider_circuits SET failure_count = failure_count + 1, updated_at = ? WHERE circuit_key = ?").run(new Date().toISOString(), key);
    const row = db.prepare("SELECT failure_count, state FROM agent_provider_circuits WHERE circuit_key = ?").get(key) as { failure_count: number; state: string };
    if (row.failure_count >= failureThreshold || row.state === "half-open") db.prepare("UPDATE agent_provider_circuits SET state = 'open', opened_until = ?, probe_started_at = NULL, updated_at = ? WHERE circuit_key = ?").run(Date.now() + openMs, new Date().toISOString(), key);
  })();
}

function retryable(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return false;
  const status = error instanceof Error ? Number(error.message.match(/HTTP (\d+)/)?.[1]) : 0;
  return !status || status === 429 || status >= 500;
}

function combinedSignal(parent: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  return parent ? AbortSignal.any([parent, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
}

export async function fetchAgentProvider(input: { endpoint: string; model: string; apiKey: string; body: unknown; signal?: AbortSignal; requestId?: string; conversationId?: string | null; userId?: string }) {
  const key = circuitKey(input.endpoint, input.model);
  claimCircuit(key);
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const started = Date.now();
    try {
      input.signal?.throwIfAborted();
      if (input.requestId) recordAgentEvent({ requestId: input.requestId, conversationId: input.conversationId, userId: input.userId, event: "provider_started", metadata: { attempt } });
      const response = await fetch(input.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.apiKey}` },
        body: JSON.stringify(input.body),
        signal: combinedSignal(input.signal, attemptTimeoutMs),
        ...(dispatcher ? { dispatcher } : {}),
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        throw new Error(`HTTP ${response.status}${detail ? `：${detail}` : ""}`);
      }
      markSuccess(key);
      if (input.requestId) recordAgentEvent({ requestId: input.requestId, conversationId: input.conversationId, userId: input.userId, event: "provider_completed", durationMs: Date.now() - started, metadata: { attempt } });
      return response;
    } catch (error) {
      lastError = error;
      if (input.signal?.aborted) throw new DOMException("请求已取消", "AbortError");
      if (attempt >= maxAttempts || !retryable(error)) break;
      if (input.requestId) recordAgentEvent({ requestId: input.requestId, conversationId: input.conversationId, userId: input.userId, event: "provider_retry", durationMs: Date.now() - started, metadata: { attempt } });
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1) + Math.floor(Math.random() * 150)));
    }
  }
  markFailure(key);
  if (input.requestId) recordAgentEvent({ requestId: input.requestId, conversationId: input.conversationId, userId: input.userId, event: "provider_failed", metadata: { message: lastError instanceof Error ? lastError.message : "unknown" } });
  throw lastError instanceof Error ? lastError : new AgentProviderUnavailableError("AI 服务连接失败");
}
