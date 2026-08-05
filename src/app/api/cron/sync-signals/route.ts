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
  return NextResponse.json({ synchronizedAt: new Date().toISOString(), results }, { status: results.some((result) => result.status === "failed") ? 207 : 200 });
}