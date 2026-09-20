import "server-only";
import { getMarketplaceDb } from "@/lib/marketplace/db";

export type AgentMetricEvent = "queued" | "provider_started" | "provider_completed" | "provider_retry" | "provider_failed" | "compile_queued" | "compile_completed" | "completed" | "failed" | "cancelled" | "rate_limited";

export function recordAgentEvent(input: { requestId: string; conversationId?: string | null; userId?: string | null; event: AgentMetricEvent; durationMs?: number; inputTokens?: number; outputTokens?: number; metadata?: Record<string, unknown> }): void {
  getMarketplaceDb().prepare(`
    INSERT INTO agent_request_events (request_id, conversation_id, user_id, event_type, duration_ms, input_tokens, output_tokens, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(input.requestId, input.conversationId ?? null, input.userId ?? null, input.event, input.durationMs ?? null, input.inputTokens ?? null, input.outputTokens ?? null, JSON.stringify(input.metadata ?? {}), new Date().toISOString());
}

export function getAgentOperationsSummary(hours = 24) {
  const db = getMarketplaceDb();
  const cutoff = new Date(Date.now() - Math.max(1, Math.min(720, hours)) * 60 * 60 * 1000).toISOString();
  const totals = db.prepare(`
    SELECT
      COUNT(DISTINCT CASE WHEN event_type = 'queued' THEN request_id END) AS requests,
      COUNT(DISTINCT CASE WHEN event_type = 'completed' THEN request_id END) AS completed,
      COUNT(DISTINCT CASE WHEN event_type = 'failed' THEN request_id END) AS failed,
      COUNT(DISTINCT CASE WHEN event_type = 'cancelled' THEN request_id END) AS cancelled,
      COALESCE(AVG(CASE WHEN event_type = 'provider_completed' THEN duration_ms END), 0) AS provider_latency_ms,
      COALESCE(AVG(CASE WHEN event_type = 'compile_completed' THEN duration_ms END), 0) AS compile_latency_ms,
      COALESCE(SUM(output_tokens), 0) AS output_tokens
    FROM agent_request_events WHERE created_at >= ?
  `).get(cutoff) as { requests: number; completed: number; failed: number; cancelled: number; provider_latency_ms: number; compile_latency_ms: number; output_tokens: number };
  const compilation = db.prepare(`
    SELECT COUNT(*) AS total, SUM(CASE WHEN json_extract(result_json, '$.status') = 'passed' THEN 1 ELSE 0 END) AS passed
    FROM agent_compile_jobs WHERE finished_at >= ? AND status = 'completed'
  `).get(cutoff) as { total: number; passed: number | null };
  const queue = db.prepare("SELECT status, COUNT(*) AS count FROM agent_compile_jobs GROUP BY status").all();
  const circuits = db.prepare("SELECT circuit_key, state, failure_count, opened_until, updated_at FROM agent_provider_circuits").all();
  return {
    hours,
    ...totals,
    successRate: totals.requests ? totals.completed / totals.requests : 0,
    compilationSuccessRate: compilation.total ? (compilation.passed ?? 0) / compilation.total : 0,
    compilationTotal: compilation.total,
    queue,
    circuits,
  };
}
