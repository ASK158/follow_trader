import { z } from "zod";
import { assertSameOrigin, audit } from "@/lib/auth/security";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { deleteAgentConversation, getAgentConversation, listAgentMessages, updateConversationRetention } from "@/lib/agent/conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ conversationId: string }> };

export async function GET(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const { conversationId } = await context.params;
  const conversation = getAgentConversation(user.id, conversationId);
  if (!conversation) return Response.json({ error: "会话不存在" }, { status: 404 });
  const url = new URL(request.url);
  const result = listAgentMessages(user.id, conversationId, Number(url.searchParams.get("limit") ?? 50), url.searchParams.has("beforeSeq") ? Number(url.searchParams.get("beforeSeq")) : null);
  return Response.json({ conversation, ...result });
}

export async function PATCH(request: Request, context: Context) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const parsed = z.object({ retentionDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.literal(36500)]) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "保留策略无效" }, { status: 400 });
  const { conversationId } = await context.params;
  if (!updateConversationRetention(user.id, conversationId, parsed.data.retentionDays)) return Response.json({ error: "会话不存在" }, { status: 404 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, context: Context) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const { conversationId } = await context.params;
  if (!deleteAgentConversation(user.id, conversationId)) return Response.json({ error: "会话不存在" }, { status: 404 });
  audit("agent.conversation_deleted", "agent_conversation", conversationId, user.id, request);
  return Response.json({ ok: true });
}
