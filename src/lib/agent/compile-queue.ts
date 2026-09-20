import "server-only";
import { randomUUID } from "node:crypto";
import { compileMql5 } from "./mql5-compiler";
import { getMarketplaceDb } from "@/lib/marketplace/db";
import type { Mql5Compilation } from "./types";
import { recordAgentEvent } from "./metrics";

const concurrency = Math.max(1, Number(process.env.AGENT_COMPILE_CONCURRENCY ?? 1));
const pollMs = 150;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("请求已取消", "AbortError");
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("请求已取消", "AbortError")); }, { once: true });
  });
}

export async function compileMql5Queued(input: { code: string; strategyName: string; requestId: string; userId: string; conversationId?: string | null; signal?: AbortSignal }): Promise<Mql5Compilation> {
  const db = getMarketplaceDb();
  const insertSlot = db.prepare("INSERT OR IGNORE INTO agent_compile_slots (slot_number) VALUES (?)");
  for (let slot = 1; slot <= concurrency; slot += 1) insertSlot.run(slot);
  const id = randomUUID();
  const queuedAt = new Date().toISOString();
  db.prepare(`INSERT INTO agent_compile_jobs (id, request_id, conversation_id, user_id, strategy_name, code_text, queued_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, input.requestId, input.conversationId ?? null, input.userId, input.strategyName, input.code, queuedAt);
  recordAgentEvent({ requestId: input.requestId, conversationId: input.conversationId, userId: input.userId, event: "compile_queued" });

  try {
    while (true) {
      throwIfAborted(input.signal);
      const row = db.prepare("SELECT status, result_json, last_error FROM agent_compile_jobs WHERE id = ?").get(id) as { status: string; result_json: string | null; last_error: string | null };
      if (row.status === "completed" && row.result_json) return JSON.parse(row.result_json) as Mql5Compilation;
      if (row.status === "failed") throw new Error(row.last_error || "编译任务失败");
      if (row.status === "cancelled") throw new DOMException("请求已取消", "AbortError");

      const claimedSlot = db.transaction(() => {
        const slot = db.prepare("SELECT slot_number FROM agent_compile_slots WHERE slot_number <= ? AND job_id IS NULL ORDER BY slot_number LIMIT 1").get(concurrency) as { slot_number: number } | undefined;
        if (!slot) return null;
        const now = new Date().toISOString();
        if (db.prepare("UPDATE agent_compile_slots SET job_id = ?, claimed_at = ? WHERE slot_number = ? AND job_id IS NULL").run(id, now, slot.slot_number).changes !== 1) return null;
        if (db.prepare("UPDATE agent_compile_jobs SET status = 'running', started_at = ? WHERE id = ? AND status = 'queued'").run(now, id).changes !== 1) {
          db.prepare("UPDATE agent_compile_slots SET job_id = NULL, claimed_at = NULL WHERE slot_number = ? AND job_id = ?").run(slot.slot_number, id);
          return null;
        }
        return slot.slot_number;
      })();
      if (claimedSlot === null) { await sleep(pollMs, input.signal); continue; }

      const started = Date.now();
      try {
        const result = await compileMql5(input.code, input.strategyName, input.signal);
        db.transaction(() => {
          db.prepare("UPDATE agent_compile_jobs SET status = 'completed', result_json = ?, finished_at = ? WHERE id = ?").run(JSON.stringify(result), new Date().toISOString(), id);
          db.prepare("UPDATE agent_compile_slots SET job_id = NULL, claimed_at = NULL WHERE slot_number = ? AND job_id = ?").run(claimedSlot, id);
        })();
        recordAgentEvent({ requestId: input.requestId, conversationId: input.conversationId, userId: input.userId, event: "compile_completed", durationMs: Date.now() - started, metadata: { status: result.status } });
        return result;
      } catch (error) {
        const cancelled = input.signal?.aborted || (error instanceof DOMException && error.name === "AbortError");
        db.transaction(() => {
          db.prepare("UPDATE agent_compile_jobs SET status = ?, last_error = ?, finished_at = ? WHERE id = ?").run(cancelled ? "cancelled" : "failed", error instanceof Error ? error.message : "编译失败", new Date().toISOString(), id);
          db.prepare("UPDATE agent_compile_slots SET job_id = NULL, claimed_at = NULL WHERE slot_number = ? AND job_id = ?").run(claimedSlot, id);
        })();
        throw error;
      }
    }
  } catch (error) {
    if (input.signal?.aborted) db.prepare("UPDATE agent_compile_jobs SET status = 'cancelled', finished_at = ? WHERE id = ? AND status IN ('queued', 'running')").run(new Date().toISOString(), id);
    throw error;
  }
}

export function recoverStaleCompileJobs(maxAgeMs = 10 * 60 * 1000): number {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const db = getMarketplaceDb();
  return db.transaction(() => {
    const result = db.prepare("UPDATE agent_compile_jobs SET status = 'failed', last_error = '工作进程中断，任务已回收', finished_at = ? WHERE status = 'running' AND started_at < ?").run(new Date().toISOString(), cutoff);
    db.prepare("UPDATE agent_compile_slots SET job_id = NULL, claimed_at = NULL WHERE job_id IS NOT NULL AND job_id IN (SELECT id FROM agent_compile_jobs WHERE status IN ('failed', 'cancelled', 'completed'))").run();
    return result.changes;
  })();
}
