import { NextResponse } from "next/server";
import { listSignals } from "@/lib/sigmac/relay-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 公开只读接口：返回当前所有实时信号（账号已脱敏）。 */
export async function GET() {
  return NextResponse.json(
    { signals: listSignals(), serverTime: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
