import { randomBytes } from "node:crypto";
import { getMarketplaceDb } from "./db";
import { marketplaceProducts, type MarketplaceProduct } from "@/lib/marketplace-data";
import type { ProductType } from "./categories";

export type ProductStatus = "pending" | "approved" | "rejected";

export type CommunityProduct = MarketplaceProduct & {
  developerId: string;
  status: ProductStatus;
  reviewNote: string | null;
  sourcePath: string;
  isTemplate: boolean;
  createdAt: string;
};

export type CatalogProduct = MarketplaceProduct & {
  origin: "official" | "community";
  developerId?: string;
  developerUsername?: string;
  status?: ProductStatus;
  isTemplate?: boolean;
  views: number;
  favorites: number;
};

type ProductRow = {
  id: string; developer_id: string; name: string; type: ProductType; platform: string;
  category: string; tagline: string; description: string; price: number; version: string;
  accent: string; cover_image: string | null; features: string; requirements: string; gallery: string;
  source_filename: string; source_path: string; is_template: number; status: ProductStatus; review_note: string | null;
  sales: number; rating: number; created_at: string; updated_at: string;
};

function rowToProduct(row: ProductRow): CommunityProduct {
  return {
    id: row.id,
    developerId: row.developer_id,
    name: row.name,
    type: row.type,
    platform: row.platform as MarketplaceProduct["platform"],
    category: row.category,
    tagline: row.tagline,
    description: row.description,
    price: row.price,
    version: row.version,
    updatedAt: row.updated_at.slice(0, 10),
    developer: "",
    sales: row.sales,
    rating: row.rating,
    views: 0,
    favorites: 0,
    accent: row.accent,
    coverImage: row.cover_image,
    features: JSON.parse(row.features || "[]") as string[],
    requirements: JSON.parse(row.requirements) as string[],
    gallery: JSON.parse(row.gallery || "[]") as MarketplaceProduct["gallery"],
    sourceFilename: row.source_filename,
    sourcePath: row.source_path,
    isTemplate: row.is_template === 1,
    status: row.status,
    reviewNote: row.review_note,
    createdAt: row.created_at,
  };
}

export type ProductInput = {
  name: string; type: ProductType; platform: string; category: string; tagline: string;
  description: string; price: number; version: string; accent: string;
  coverImage: string | null;
  requirements: string[];
  sourceFilename: string; sourcePath: string;
  isTemplate: boolean;
};

export function createProduct(developerId: string, input: ProductInput, id: string = `dev-${randomBytes(6).toString("hex")}`): CommunityProduct {
  const db = getMarketplaceDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO products (id, developer_id, name, type, platform, category, tagline, description, price, version, accent, cover_image, features, requirements, gallery, source_filename, source_path, is_template, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, '[]', ?, ?, ?, 'pending', ?, ?)
  `).run(
    id, developerId, input.name, input.type, input.platform, input.category, input.tagline, input.description,
    input.price, input.version, input.accent, input.coverImage, JSON.stringify(input.requirements),
    input.sourceFilename, input.sourcePath, Number(input.isTemplate), now, now,
  );
  return getProductById(id)!;
}

export function updateProduct(id: string, developerId: string, input: ProductInput): void {
  const db = getMarketplaceDb();
  db.prepare(`
    UPDATE products SET name = ?, type = ?, platform = ?, category = ?, tagline = ?, description = ?, price = ?, version = ?, accent = ?, cover_image = ?,
      features = '[]', requirements = ?, gallery = '[]', source_filename = ?, source_path = ?, is_template = ?, status = 'pending', review_note = NULL, updated_at = ?
    WHERE id = ? AND developer_id = ?
  `).run(
    input.name, input.type, input.platform, input.category, input.tagline, input.description, input.price, input.version, input.accent, input.coverImage,
    JSON.stringify(input.requirements),
    input.sourceFilename, input.sourcePath, Number(input.isTemplate), new Date().toISOString(), id, developerId,
  );
}

export function getProductById(id: string): CommunityProduct | null {
  const row = getMarketplaceDb().prepare("SELECT * FROM products WHERE id = ?").get(id) as ProductRow | undefined;
  return row ? rowToProduct(row) : null;
}

export function listDeveloperProducts(developerId: string): CommunityProduct[] {
  const rows = getMarketplaceDb().prepare("SELECT * FROM products WHERE developer_id = ? ORDER BY created_at DESC").all(developerId) as ProductRow[];
  return rows.map(rowToProduct);
}

export function listProductsByStatus(status: ProductStatus): CommunityProduct[] {
  const rows = getMarketplaceDb().prepare("SELECT * FROM products WHERE status = ? ORDER BY created_at ASC").all(status) as ProductRow[];
  return rows.map(rowToProduct);
}

export function reviewProduct(id: string, decision: "approved" | "rejected", note: string | null): void {
  getMarketplaceDb().prepare("UPDATE products SET status = ?, review_note = ?, updated_at = ? WHERE id = ?").run(decision, note, new Date().toISOString(), id);
}

export function incrementProductSales(id: string): void {
  getMarketplaceDb().prepare("UPDATE products SET sales = sales + 1 WHERE id = ?").run(id);
}

type ProductMetricsRow = { product_id: string; views: number; favorites: number };

const officialCategories: Record<string, string> = {
  "quant-pulse-ea": "趋势",
  "orderflow-radar": "量能",
  "volatility-guard": "风控",
  "market-structure-pro": "形态",
  "gold-session-scalper": "剥头皮",
  "adaptive-rsi-suite": "震荡",
};

function withCatalogMetrics(product: MarketplaceProduct, origin: CatalogProduct["origin"], metrics?: ProductMetricsRow): CatalogProduct {
  const baseViews = product.views ?? product.sales * 12;
  const baseFavorites = product.favorites ?? Math.max(1, Math.round(product.sales * 0.24));
  return {
    ...product,
    type: product.id === "volatility-guard" ? "其他工具" : product.type,
    category: officialCategories[product.id] ?? product.category,
    origin,
    views: baseViews + (metrics?.views ?? 0),
    favorites: baseFavorites + (metrics?.favorites ?? 0),
  };
}

function getMetrics(): Map<string, ProductMetricsRow> {
  const rows = getMarketplaceDb().prepare(`
    SELECT product_id, MAX(views) AS views, (
      SELECT COUNT(*) FROM product_favorites favorites WHERE favorites.product_id = product_views.product_id
    ) AS favorites
    FROM product_views GROUP BY product_id
    UNION ALL
    SELECT product_id, 0 AS views, COUNT(*) AS favorites FROM product_favorites
    WHERE product_id NOT IN (SELECT product_id FROM product_views)
    GROUP BY product_id
  `).all() as ProductMetricsRow[];
  return new Map(rows.map((row) => [row.product_id, row]));
}

export function incrementProductViews(id: string): void {
  getMarketplaceDb().prepare(`
    INSERT INTO product_views (product_id, views) VALUES (?, 1)
    ON CONFLICT(product_id) DO UPDATE SET views = views + 1
  `).run(id);
}

export function getFavoriteProductIds(visitorId: string | undefined): Set<string> {
  if (!visitorId) return new Set();
  const rows = getMarketplaceDb().prepare("SELECT product_id FROM product_favorites WHERE visitor_id = ?").all(visitorId) as Array<{ product_id: string }>;
  return new Set(rows.map((row) => row.product_id));
}

export function getUserFavoriteProductIds(userId: string): Set<string> {
  const rows = getMarketplaceDb().prepare("SELECT product_id FROM product_favorites WHERE user_id = ?").all(userId) as Array<{ product_id: string }>;
  return new Set(rows.map((row) => row.product_id));
}

export function setProductFavorite(visitorId: string, productId: string, favorite: boolean): number {
  const db = getMarketplaceDb();
  if (favorite) {
    db.prepare("INSERT OR IGNORE INTO product_favorites (visitor_id, product_id, created_at) VALUES (?, ?, ?)").run(visitorId, productId, new Date().toISOString());
  } else {
    db.prepare("DELETE FROM product_favorites WHERE visitor_id = ? AND product_id = ?").run(visitorId, productId);
  }
  const row = db.prepare("SELECT COUNT(*) AS count FROM product_favorites WHERE product_id = ?").get(productId) as { count: number };
  return row.count;
}

export function mergeVisitorFavoritesIntoUser(visitorId: string | undefined, userId: string): void {
  if (!visitorId) return;
  const db = getMarketplaceDb();
  const ownerId = `user:${userId}`;
  db.transaction(() => {
    db.prepare(`
      INSERT OR IGNORE INTO product_favorites (visitor_id, product_id, created_at, user_id)
      SELECT ?, product_id, created_at, ? FROM product_favorites WHERE visitor_id = ?
    `).run(ownerId, userId, visitorId);
    db.prepare("DELETE FROM product_favorites WHERE visitor_id = ?").run(visitorId);
  })();
}

/** 商城目录：官方演示商品 + 已上架的社区商品 */
export function getCatalogProducts(): CatalogProduct[] {
  const metrics = getMetrics();
  const official: CatalogProduct[] = marketplaceProducts.map((product) => withCatalogMetrics(product, "official", metrics.get(product.id)));
  const community: CatalogProduct[] = listProductsByStatus("approved").map((product) => ({
    ...withCatalogMetrics(product, "community", metrics.get(product.id)),
    ...getDeveloperIdentity(product.developerId),
    developerId: product.developerId,
    status: product.status,
  }));
  return [...community, ...official];
}

export function getCatalogProduct(id: string): CatalogProduct | null {
  const metrics = getMetrics().get(id);
  const community = getProductById(id);
  if (community && community.status === "approved") {
    return { ...withCatalogMetrics(community, "community", metrics), ...getDeveloperIdentity(community.developerId), developerId: community.developerId, status: community.status };
  }
  const official = marketplaceProducts.find((product) => product.id === id);
  return official ? withCatalogMetrics(official, "official", metrics) : null;
}

export function listPublicUserProducts(userId: string): CatalogProduct[] {
  const ids = new Set(listDeveloperProducts(userId).filter((product) => product.status === "approved").map((product) => product.id));
  return getCatalogProducts().filter((product) => ids.has(product.id));
}

function getDeveloperIdentity(developerId: string): { developer: string; developerUsername?: string } {
  const row = getMarketplaceDb().prepare("SELECT name, username FROM developers WHERE id = ?").get(developerId) as { name: string; username: string | null } | undefined;
  return { developer: row?.name ?? "社区用户", developerUsername: row?.username ?? undefined };
}
