import { randomBytes } from "node:crypto";
import { getMarketplaceDb } from "./db";

export type ProductComment = {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
  verifiedBuyer: boolean;
};

type CommentRow = {
  id: string;
  product_id: string;
  developer_id: string;
  user_name: string;
  content: string;
  created_at: string;
  verified_buyer: number;
};

export function listProductComments(productId: string): ProductComment[] {
  const rows = getMarketplaceDb().prepare(`
    SELECT comments.id, comments.product_id, comments.developer_id, developers.name AS user_name,
      comments.content, comments.created_at, EXISTS(
        SELECT 1 FROM orders WHERE orders.buyer_user_id = comments.developer_id
          AND orders.product_id = comments.product_id AND orders.status = 'confirmed'
      ) AS verified_buyer
    FROM product_comments comments
    JOIN developers ON developers.id = comments.developer_id
    WHERE comments.product_id = ? AND comments.is_hidden = 0
    ORDER BY comments.created_at DESC
    LIMIT 100
  `).all(productId) as CommentRow[];
  return rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    userId: row.developer_id,
    userName: row.user_name,
    content: row.content,
    createdAt: row.created_at,
    verifiedBuyer: Boolean(row.verified_buyer),
  }));
}

export function createProductComment(productId: string, userId: string, content: string): ProductComment {
  const db = getMarketplaceDb();
  const id = `comment-${randomBytes(8).toString("hex")}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO product_comments (id, product_id, developer_id, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, productId, userId, content, now, now);
  const user = db.prepare("SELECT name FROM developers WHERE id = ?").get(userId) as { name: string };
  const verifiedBuyer = Boolean(db.prepare("SELECT 1 FROM orders WHERE buyer_user_id = ? AND product_id = ? AND status = 'confirmed'").get(userId, productId));
  return { id, productId, userId, userName: user.name, content, createdAt: now, verifiedBuyer };
}