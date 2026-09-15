import { randomBytes } from "node:crypto";
import { getMarketplaceDb } from "@/lib/marketplace/db";

export type ObservationComment = {
  id: string;
  accountId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
};

type CommentRow = { id: string; account_id: string; user_id: string; user_name: string; content: string; created_at: string };

export function listObservationComments(accountId: string): ObservationComment[] {
  const rows = getMarketplaceDb().prepare(`
    SELECT comments.id, comments.account_id, comments.user_id, developers.name AS user_name, comments.content, comments.created_at
    FROM observation_comments comments JOIN developers ON developers.id = comments.user_id
    WHERE comments.account_id = ? AND comments.is_hidden = 0
    ORDER BY comments.created_at DESC LIMIT 100
  `).all(accountId) as CommentRow[];
  return rows.map((row) => ({ id: row.id, accountId: row.account_id, userId: row.user_id, userName: row.user_name, content: row.content, createdAt: row.created_at }));
}

export function createObservationComment(accountId: string, userId: string, content: string): ObservationComment {
  const id = `observe-comment-${randomBytes(8).toString("hex")}`;
  const now = new Date().toISOString();
  const db = getMarketplaceDb();
  db.prepare("INSERT INTO observation_comments (id, account_id, user_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, accountId, userId, content, now, now);
  const user = db.prepare("SELECT name FROM developers WHERE id = ?").get(userId) as { name: string };
  return { id, accountId, userId, userName: user.name, content, createdAt: now };
}