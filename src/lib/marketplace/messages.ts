import { randomBytes } from "node:crypto";
import { getMarketplaceDb } from "./db";

export type ConversationSummary = {
  id: string;
  participantId: string;
  participantName: string;
  participantUsername: string;
  participantAvatarUrl: string | null;
  lastMessage: string;
  updatedAt: string;
  unreadCount: number;
};

export type DirectMessage = { id: string; senderId: string; content: string; createdAt: string };

type ConversationRow = {
  id: string; participant_id: string; participant_name: string; participant_username: string;
  participant_avatar: string | null; last_message: string | null; updated_at: string; unread_count: number;
};

export function listConversations(userId: string): ConversationSummary[] {
  const rows = getMarketplaceDb().prepare(`
    SELECT c.id,
      CASE WHEN c.user_a_id = ? THEN c.user_b_id ELSE c.user_a_id END AS participant_id,
      d.name AS participant_name, d.username AS participant_username, d.avatar_filename AS participant_avatar,
      (SELECT content FROM direct_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
      c.updated_at,
      (SELECT COUNT(*) FROM direct_messages m WHERE m.conversation_id = c.id AND m.sender_id <> ?
        AND m.created_at > COALESCE((SELECT last_read_at FROM direct_message_reads WHERE conversation_id = c.id AND user_id = ?), '')) AS unread_count
    FROM direct_conversations c
    JOIN developers d ON d.id = CASE WHEN c.user_a_id = ? THEN c.user_b_id ELSE c.user_a_id END
    WHERE c.user_a_id = ? OR c.user_b_id = ? ORDER BY c.updated_at DESC
  `).all(userId, userId, userId, userId, userId, userId) as ConversationRow[];
  return rows.map((row) => ({
    id: row.id, participantId: row.participant_id, participantName: row.participant_name,
    participantUsername: row.participant_username,
    participantAvatarUrl: row.participant_avatar ? `/api/users/${row.participant_id}/avatar` : null,
    lastMessage: row.last_message ?? "尚无消息", updatedAt: row.updated_at, unreadCount: row.unread_count,
  }));
}

export function getOrCreateConversation(userId: string, participantId: string): string {
  if (userId === participantId) throw new Error("不能给自己发送消息");
  const db = getMarketplaceDb();
  const [userA, userB] = [userId, participantId].sort();
  const existing = db.prepare("SELECT id FROM direct_conversations WHERE user_a_id = ? AND user_b_id = ?").get(userA, userB) as { id: string } | undefined;
  if (existing) return existing.id;
  if (!db.prepare("SELECT 1 FROM developers WHERE id = ? AND status = 'active'").get(participantId)) throw new Error("用户不存在");
  const id = `dm-${randomBytes(10).toString("hex")}`;
  const now = new Date().toISOString();
  db.prepare("INSERT INTO direct_conversations (id, user_a_id, user_b_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, userA, userB, now, now);
  return id;
}

export function getConversation(conversationId: string, userId: string): { participant: ConversationSummary; messages: DirectMessage[] } | null {
  const summary = listConversations(userId).find((item) => item.id === conversationId);
  if (!summary) return null;
  const messages = getMarketplaceDb().prepare("SELECT id, sender_id, content, created_at FROM direct_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 300").all(conversationId) as Array<{ id: string; sender_id: string; content: string; created_at: string }>;
  return { participant: summary, messages: messages.map((message) => ({ id: message.id, senderId: message.sender_id, content: message.content, createdAt: message.created_at })) };
}

export function sendMessage(conversationId: string, senderId: string, content: string): DirectMessage {
  const db = getMarketplaceDb();
  const conversation = db.prepare("SELECT 1 FROM direct_conversations WHERE id = ? AND (user_a_id = ? OR user_b_id = ?)").get(conversationId, senderId, senderId);
  if (!conversation) throw new Error("会话不存在");
  const message = { id: `message-${randomBytes(10).toString("hex")}`, senderId, content, createdAt: new Date().toISOString() };
  db.transaction(() => {
    db.prepare("INSERT INTO direct_messages (id, conversation_id, sender_id, content, created_at) VALUES (?, ?, ?, ?, ?)").run(message.id, conversationId, senderId, content, message.createdAt);
    db.prepare("UPDATE direct_conversations SET updated_at = ? WHERE id = ?").run(message.createdAt, conversationId);
  })();
  return message;
}

export function markConversationRead(conversationId: string, userId: string): void {
  const db = getMarketplaceDb();
  if (!db.prepare("SELECT 1 FROM direct_conversations WHERE id = ? AND (user_a_id = ? OR user_b_id = ?)").get(conversationId, userId, userId)) return;
  db.prepare(`INSERT INTO direct_message_reads (conversation_id, user_id, last_read_at) VALUES (?, ?, ?)
    ON CONFLICT(conversation_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at`).run(conversationId, userId, new Date().toISOString());
}
