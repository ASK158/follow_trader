import { getCurrentUser } from "@/lib/marketplace/auth";
import { listAgentConversations } from "@/lib/agent/conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const url = new URL(request.url);
  return Response.json(listAgentConversations(user.id, Number(url.searchParams.get("limit") ?? 20), url.searchParams.get("cursor")));
}
