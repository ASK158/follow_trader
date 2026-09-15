import { randomBytes } from "node:crypto";
import { getMarketplaceDb } from "./db";
import { getMarketplaceProduct } from "@/lib/marketplace-data";

export type Order = {
  id: string;
  productId: string;
  buyerEmail: string;
  amount: number;
  currency: "GA";
  status: "confirmed" | "refunded";
  createdAt: string;
  productName?: string;
  downloadUrl?: string;
};

export type FinanceOrder = Order & { buyerName: string | null };

type OrderRow = { id: string; product_id: string; buyer_email: string; amount: number; currency: "GA"; status: "confirmed" | "refunded"; download_token: string; created_at: string };

function rowToOrder(row: OrderRow): Order {
  return { id: row.id, productId: row.product_id, buyerEmail: row.buyer_email, amount: row.amount, currency: row.currency, status: row.status, createdAt: row.created_at };
}

export class InsufficientGaBalanceError extends Error {
  constructor(public readonly balance: number, public readonly required: number) {
    super("Gas 余额不足");
  }
}

/** 原子扣除 Gas、记录账本并创建已确认订单。内部标识保留 Ga/GA 以兼容现有数据。 */
export function purchaseWithGa(productId: string, productName: string, buyerEmail: string, amount: number, buyerUserId: string): { order: Order; downloadToken: string; balance: number } {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("商品 Gas 定价无效");
  const db = getMarketplaceDb();
  const id = `ord-${randomBytes(8).toString("hex")}`;
  const downloadToken = randomBytes(24).toString("hex");
  const createdAt = new Date().toISOString();
  const balance = db.transaction(() => {
    const current = db.prepare("SELECT ga_balance FROM developers WHERE id = ?").get(buyerUserId) as { ga_balance: number } | undefined;
    if (!current) throw new Error("购买账户不存在");
    if (current.ga_balance < amount) throw new InsufficientGaBalanceError(current.ga_balance, amount);
    const nextBalance = current.ga_balance - amount;
    db.prepare("UPDATE developers SET ga_balance = ?, updated_at = ? WHERE id = ?").run(nextBalance, createdAt, buyerUserId);
    db.prepare("INSERT INTO orders (id, product_id, buyer_email, amount, currency, status, download_token, created_at, buyer_user_id) VALUES (?, ?, ?, ?, 'GA', 'confirmed', ?, ?, ?)").run(
      id, productId, buyerEmail, amount, downloadToken, createdAt, buyerUserId,
    );
    if (amount > 0) {
      db.prepare(`
        INSERT INTO ga_transactions (id, user_id, type, amount, balance_after, order_id, reason, created_at)
        VALUES (?, ?, 'purchase', ?, ?, ?, ?, ?)
      `).run(`ga-${randomBytes(10).toString("hex")}`, buyerUserId, -amount, nextBalance, id, `购买商品：${productName}`.slice(0, 200), createdAt);
    }
    db.prepare("UPDATE products SET sales = sales + 1 WHERE id = ?").run(productId);
    return nextBalance;
  })();
  return { order: { id, productId, buyerEmail, amount, currency: "GA", status: "confirmed", createdAt }, downloadToken, balance };
}

export function hasUserPurchased(userId: string, productId: string): boolean {
  return Boolean(getMarketplaceDb().prepare("SELECT 1 FROM orders WHERE buyer_user_id = ? AND product_id = ? AND status = 'confirmed'").get(userId, productId));
}

export function listUserOrders(userId: string): Order[] {
  const rows = getMarketplaceDb().prepare(`
    SELECT orders.*, products.name AS product_name FROM orders
    LEFT JOIN products ON products.id = orders.product_id
    WHERE buyer_user_id = ? ORDER BY orders.created_at DESC
  `).all(userId) as Array<OrderRow & { product_name: string | null }>;
  return rows.map((row) => ({ ...rowToOrder(row), productName: row.product_name ?? row.product_id, downloadUrl: `/api/marketplace/download/${row.id}?token=${row.download_token}` }));
}

export function verifyDownloadToken(orderId: string, token: string): Order | null {
  const row = getMarketplaceDb().prepare("SELECT * FROM orders WHERE id = ? AND download_token = ? AND status = 'confirmed'").get(orderId, token) as OrderRow | undefined;
  return row ? rowToOrder(row) : null;
}

export function listProductOrders(productId: string): Order[] {
  const rows = getMarketplaceDb().prepare("SELECT * FROM orders WHERE product_id = ? ORDER BY created_at DESC").all(productId) as OrderRow[];
  return rows.map(rowToOrder);
}

export function listFinanceOrders(limit = 300): FinanceOrder[] {
  const safeLimit = Math.max(1, Math.min(1000, Math.trunc(limit)));
  const rows = getMarketplaceDb().prepare(`
    SELECT orders.*, products.name AS product_name, users.name AS buyer_name
    FROM orders
    LEFT JOIN products ON products.id = orders.product_id
    LEFT JOIN developers users ON users.id = orders.buyer_user_id
    ORDER BY orders.created_at DESC LIMIT ?
  `).all(safeLimit) as Array<OrderRow & { product_name: string | null; buyer_name: string | null }>;
  return rows.map((row) => ({
    ...rowToOrder(row),
    productName: row.product_name ?? getMarketplaceProduct(row.product_id)?.name ?? row.product_id,
    buyerName: row.buyer_name,
  }));
}
