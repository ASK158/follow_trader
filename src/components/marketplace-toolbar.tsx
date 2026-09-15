"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProductType } from "@/lib/marketplace/categories";

export type MarketplaceSort = "hot" | "price-asc" | "price-desc" | "favorites";

type Props = { query: string; sort: MarketplaceSort; selectedType: ProductType | null; selectedCategory: string | null; resultCount: number; currentUserName: string | null };

export function MarketplaceToolbar({ query, sort, selectedType, selectedCategory, resultCount, currentUserName }: Props) {
  const router = useRouter();

  function changeSort(nextSort: MarketplaceSort) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (nextSort !== "hot") params.set("sort", nextSort);
    if (selectedType) params.set("type", selectedType);
    if (selectedCategory) params.set("category", selectedCategory);
    router.push(`/marketplace${params.size ? `?${params.toString()}` : ""}`);
  }

  return (
    <section className="market-toolbar" aria-label="商品搜索与排序">
      <form className="market-search" action="/marketplace" method="get">
        <label htmlFor="market-search-input">搜索商品</label>
        <div>
          <input id="market-search-input" name="q" type="search" defaultValue={query} maxLength={80} placeholder="搜索商品名称或类型，例如 EA、指标…" />
          {sort !== "hot" && <input type="hidden" name="sort" value={sort} />}
          {selectedType && <input type="hidden" name="type" value={selectedType} />}
          {selectedCategory && <input type="hidden" name="category" value={selectedCategory} />}
          <button type="submit">搜索</button>
          {query && <Link href={selectedType ? `/marketplace?type=${encodeURIComponent(selectedType)}` : "/marketplace"}>清除</Link>}
        </div>
      </form>
      <div className="market-sort-group">
        <span>{query ? `找到 ${resultCount} 件商品` : `共 ${resultCount} 件商品`}</span>
        <label htmlFor="market-sort">排序</label>
        <select id="market-sort" value={sort} onChange={(event) => changeSort(event.target.value as MarketplaceSort)}>
          <option value="hot">热度优先（查看次数）</option>
          <option value="price-asc">价格：从低到高</option>
          <option value="price-desc">价格：从高到低</option>
          <option value="favorites">收藏数量</option>
        </select>
      </div>
      <div className="market-toolbar-actions">
        <Link href="/marketplace/favorites">收藏夹 ♡</Link>
        <Link href={currentUserName ? "/developer" : "/developer/login"} className="market-dev-link">{currentUserName ? `${currentUserName} · 个人中心` : "注册/登录"} →</Link>
      </div>
    </section>
  );
}
