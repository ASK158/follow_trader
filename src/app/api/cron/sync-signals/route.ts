import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { synchronizeSignals } from "@/lib/signal-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const results = await synchronizeSignals();
  revalidatePath("/");
  revalidatePath("/signals/[id]", "page");
  // 明细 CSV 未刷新（如 MQL5_SESSION_COOKIE 失效被 302 到登录页）也按部分失败上报，
  // 让 cron 以非 0 退出码在日志中显式报警，而不是只刷新指标时间戳造成"看似同步"。
  const csvStale = results.some((result) => !result.csvUpdated);
  return NextResponse.json(
    {
      synchronizedAt: new Date().toISOString(),
      results,
      ...(csvStale ? { note: "存在明细 CSV 未刷新的信号，请检查 MQL5_SESSION_COOKIE 是否失效" } : {}),
    },
    { status: results.some((result) => result.status === "failed") || csvStale ? 207 : 200 },
  );
}