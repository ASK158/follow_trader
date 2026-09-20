import { cleanupAgentData } from "@/lib/agent/conversations";
import { recoverStaleCompileJobs } from "@/lib/agent/compile-queue";
import { releaseAllStaleAgentReservations } from "@/lib/agent/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "未授权" }, { status: 401 });
  return Response.json({ cleanedAt: new Date().toISOString(), reservations: releaseAllStaleAgentReservations(), compileJobs: recoverStaleCompileJobs(), ...cleanupAgentData() });
}
