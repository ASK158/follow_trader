import { z } from "zod";
import { assertSameOrigin, audit, consumeRateLimit } from "@/lib/auth/security";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { getConversation, markConversationRead, sendMessage } from "@/lib/marketplace/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ conversationId: string }> };

export async function GET(_request: Request, { params }: Props) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const { conversationId } = await params;
  const conversation = getConversation(conversationId, user.id);
  if (!conversation) return Response.json({ error: "会话不存在" }, { status: 404 });
  markConversationRead(conversationId, user.id);
  return Response.json(conversation);
}

export async function POST(request: Request, { params }: Props) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const { conversationId } = await params;
  if (!getConversation(conversationId, user.id)) return Response.json({ error: "会话不存在" }, { status: 404 });
  const parsed = z.object({ content: z.string().trim().min(1).max(2000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "消息内容需要 1 至 2000 个字符" }, { status: 400 });
  const rate = consumeRateLimit("direct-message", user.id, 30, 60 * 1000);
  if (rate.limited) return Response.json({ error: "发送过于频繁，请稍后再试" }, { status: 429 });
  const message = sendMessage(conversationId, user.id, parsed.data.content);
  markConversationRead(conversationId, user.id);
  audit("message.sent", "conversation", user.id, conversationId, request);
  return Response.json({ message }, { status: 201 });
}
