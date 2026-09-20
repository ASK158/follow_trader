import { getAgentOperationsSummary } from "@/lib/agent/metrics";
import { getCurrentUser, isAdmin } from "@/lib/marketplace/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return Response.json({ error: "需要管理员权限" }, { status: 403 });
  const hours = Number(new URL(request.url).searchParams.get("hours") ?? 24);
  return Response.json(getAgentOperationsSummary(hours));
}
