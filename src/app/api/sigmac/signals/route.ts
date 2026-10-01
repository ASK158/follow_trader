import { NextResponse } from "next/server";
import { listSignals, type PublicLiveSignal } from "@/lib/sigmac/relay-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 长轮询最长挂起时间；与中间层超时留出余量。 */
const MAX_WAIT_MS = 25_000;
/** 挂起期间检查存储的间隔。 */
const POLL_INTERVAL_MS = 400;

function noStore(payload: unknown): NextResponse {
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}

function hasNewer(signals: PublicLiveSignal[], since: number): boolean {
  return signals.some((signal) => signal.sequence > since);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * 公开只读接口：返回当前所有实时信号（账号已脱敏）。
 * 支持 `?since=<sequence>&wait=<seconds>` 长轮询：没有任何信号序号超过 since 时
 * 最多挂起 wait 秒，一旦有新快照立即返回；不带参数则立即返回（网页轮询兼容）。
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sinceRaw = Number(url.searchParams.get("since") ?? "");
  const waitRaw = Number(url.searchParams.get("wait") ?? "");
  const since = Number.isInteger(sinceRaw) && sinceRaw >= 0 ? sinceRaw : null;
  const waitMs = Number.isFinite(waitRaw) && waitRaw > 0 ? Math.min(waitRaw * 1_000, MAX_WAIT_MS) : 0;

  if (since === null || waitMs === 0) {
    return noStore({ signals: listSignals(), serverTime: new Date().toISOString() });
  }

  const deadline = Date.now() + waitMs;
  let signals = listSignals();
  while (!hasNewer(signals, since)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(POLL_INTERVAL_MS, remaining));
    signals = listSignals();
  }
  return noStore({ signals, serverTime: new Date().toISOString() });
}
