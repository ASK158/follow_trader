import { z } from "zod";
import { assertSameOrigin, audit, consumeRateLimit } from "@/lib/auth/security";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { getMarketplaceDb } from "@/lib/marketplace/db";
import { getOrCreateConversation, listConversations } from "@/lib/marketplace/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  return Response.json({ conversations: listConversations(user.id) });
}

export async function POST(request: Request) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const parsed = z.object({ participantId: z.string().min(1) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.participantId === user.id) return Response.json({ error: "收件人无效" }, { status: 400 });
  const target = getMarketplaceDb().prepare("SELECT message_permission FROM developers WHERE id = ? AND status = 'active'").get(parsed.data.participantId) as { message_permission: string } | undefined;
  if (!target) return Response.json({ error: "用户不存在" }, { status: 404 });
  const followsTarget = Boolean(getMarketplaceDb().prepare("SELECT 1 FROM user_follows WHERE follower_id = ? AND following_id = ?").get(user.id, parsed.data.participantId));
  const targetFollows = Boolean(getMarketplaceDb().prepare("SELECT 1 FROM user_follows WHERE follower_id = ? AND following_id = ?").get(parsed.data.participantId, user.id));
  const allowed = target.message_permission === "everyone" || (target.message_permission === "followers" && followsTarget) || (target.message_permission === "mutual" && followsTarget && targetFollows);
  if (!allowed) return Response.json({ error: "对方当前不接收你的消息" }, { status: 403 });
  const rate = consumeRateLimit("message-conversation", user.id, 20, 60 * 60 * 1000);
  if (rate.limited) return Response.json({ error: "创建会话过于频繁" }, { status: 429 });
  const conversationId = getOrCreateConversation(user.id, parsed.data.participantId);
  audit("message.conversation_started", "conversation", user.id, conversationId, request);
  return Response.json({ conversationId }, { status: 201 });
}
