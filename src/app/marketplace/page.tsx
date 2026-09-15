import type { Metadata } from "next";
import { cookies } from "next/headers";
import { MarketplaceCategoryTabs } from "@/components/marketplace-category-tabs";
import { MarketplaceCard } from "@/components/marketplace-card";
import { MarketplaceToolbar, type MarketplaceSort } from "@/components/marketplace-toolbar";
import { SiteNav } from "@/components/site-nav";
import { getCurrentDeveloper } from "@/lib/marketplace/auth";
import { PRODUCT_CATEGORIES, isProductCategory, isProductType, type ProductType } from "@/lib/marketplace/categories";
import { getCatalogProducts, getFavoriteProductIds } from "@/lib/marketplace/products";

export const metadata: Metadata = { title: "EA / 指标商城 | Sigma Signal", description: "浏览 MT4、MT5 EA 与技术指标，查看功能说明和源码交付信息。" };

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string; sort?: string; type?: string; category?: string }> };

const validSorts = new Set<MarketplaceSort>(["hot", "price-asc", "price-desc", "favorites"]);

export default async function MarketplacePage({ searchParams }: Props) {
  const products = getCatalogProducts();
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 80);
  const sort: MarketplaceSort = validSorts.has(params.sort as MarketplaceSort) ? params.sort as MarketplaceSort : "hot";
  const selectedType: ProductType | null = params.type && isProductType(params.type) ? params.type : null;
  const selectedCategory = selectedType && params.category && isProductCategory(selectedType, params.category) ? params.category : null;
  const [cookieStore, currentUser] = await Promise.all([cookies(), getCurrentDeveloper()]);
  const favoriteIds = getFavoriteProductIds(currentUser ? `user:${currentUser.id}` : cookieStore.get("marketplace_visitor")?.value);
  const eaCount = products.filter((product) => product.type === "EA").length;
  const indicatorCount = products.filter((product) => product.type === "指标").length;
  const toolCount = products.filter((product) => product.type === "其他工具").length;
  const normalizedQuery = query.toLocaleLowerCase("zh-CN");
  const visibleProducts = products
    .filter((product) => (!selectedType || product.type === selectedType) && (!selectedCategory || product.category === selectedCategory))
    .filter((product) => !normalizedQuery || product.name.toLocaleLowerCase("zh-CN").includes(normalizedQuery) || product.type.toLocaleLowerCase("zh-CN").includes(normalizedQuery) || product.category.toLocaleLowerCase("zh-CN").includes(normalizedQuery))
    .sort((left, right) => {
      if (sort === "price-asc") return left.price - right.price || right.views - left.views;
      if (sort === "price-desc") return right.price - left.price || right.views - left.views;
      if (sort === "favorites") return right.favorites - left.favorites || right.views - left.views;
      return right.views - left.views || right.favorites - left.favorites;
    });
  return (
    <main className="platform-shell marketplace-shell">
      <SiteNav active="marketplace" />
      <header className="platform-hero market-hero">
        <div><span className="panel-code">EA & INDICATOR MARKETPLACE</span><h1>交易工具市场</h1><p>发现更多的交易工具，分享更多的交易工具——Sigma共享社区</p></div>
        <div className="market-hero-stats"><span><b>{products.length}</b>在售商品</span><span><b>{eaCount}</b>EA 系统</span><span><b>{indicatorCount}</b>指标</span><span><b>{toolCount}</b>其他工具</span></div>
      </header>
      <MarketplaceCategoryTabs selectedType={selectedType} selectedCategory={selectedCategory} categories={PRODUCT_CATEGORIES} query={query} sort={sort} />
      <MarketplaceToolbar query={query} sort={sort} selectedType={selectedType} selectedCategory={selectedCategory} resultCount={visibleProducts.length} currentUserName={currentUser?.name ?? null} />
      {visibleProducts.length > 0 ? <section className="market-grid" aria-label="EA、指标与工具商品列表">{visibleProducts.map((product) => <MarketplaceCard key={product.id} product={product} isFavorite={favoriteIds.has(product.id)} />)}</section> : <section className="market-empty-results"><b>没有找到匹配商品</b><p>请尝试其他商品名称或类型关键词。</p></section>}
      <footer className="platform-footer">社区作品由开发者提交并经平台审核后上架；购买后通过订单凭证下载开发者交付的真实源码。自动交易具有风险，请先在模拟账户验证。</footer>
    </main>
  );
}
