import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { MarketplaceCard } from "@/components/marketplace-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { getCatalogProducts, getFavoriteProductIds } from "@/lib/marketplace/products";

export const metadata: Metadata = { title: "收藏夹 | Sigma Bot", description: "查看已收藏的交易工具商品。" };
export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const [cookieStore, user] = await Promise.all([cookies(), getCurrentUser()]);
  const favoriteIds = getFavoriteProductIds(user ? `user:${user.id}` : cookieStore.get("marketplace_visitor")?.value);
  const products = getCatalogProducts().filter((product) => favoriteIds.has(product.id));

  return (
    <main className="platform-shell marketplace-shell">
      <SiteNav active="favorites" />
      <div className="platform-breadcrumb"><Link href="/marketplace">← 返回交易工具市场</Link><span>MY FAVORITES</span></div>
      <header className="favorites-header"><span className="panel-code">SAVED PRODUCTS</span><h1>收藏夹</h1><p>集中查看已收藏的 EA、指标与其他交易工具。</p></header>
      {products.length > 0 ? (
        <section className="market-grid" aria-label="已收藏商品">{products.map((product) => <MarketplaceCard key={product.id} product={product} isFavorite />)}</section>
      ) : (
        <section className="favorites-empty"><b>收藏夹还是空的</b><p>在商品卡片点击“♡ 收藏”，商品会保存在这里。</p><Link href="/marketplace">浏览商城 →</Link></section>
      )}
      <SiteFooter notice="收藏夹仅保存当前账户或浏览器中的已收藏商品。" />
    </main>
  );
}
