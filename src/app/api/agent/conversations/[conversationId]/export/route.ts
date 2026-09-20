import { getCurrentUser } from "@/lib/marketplace/auth";
import { exportAgentConversation } from "@/lib/agent/conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ conversationId: string }> };

export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const { conversationId } = await context.params;
  const data = exportAgentConversation(user.id, conversationId);
  if (!data) return Response.json({ error: "会话不存在" }, { status: 404 });
  return new Response(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename=agent-conversation-${conversationId}.json`, "Cache-Control": "no-store" } });
}
