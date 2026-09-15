import Link from "next/link";
import { PRODUCT_TYPES, type ProductType } from "@/lib/marketplace/categories";
import type { MarketplaceSort } from "./marketplace-toolbar";

type Props = {
  selectedType: ProductType | null;
  selectedCategory: string | null;
  categories: Record<ProductType, readonly string[]>;
  query: string;
  sort: MarketplaceSort;
};

function categoryHref(query: string, sort: MarketplaceSort, type?: ProductType, category?: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (sort !== "hot") params.set("sort", sort);
  if (type) params.set("type", type);
  if (type && category) params.set("category", category);
  return `/marketplace${params.size ? `?${params.toString()}` : ""}`;
}

export function MarketplaceCategoryTabs({ selectedType, selectedCategory, categories, query, sort }: Props) {
  return (
    <nav className="market-category-nav" aria-label="商品分类">
      <div className="market-main-tabs" role="list">
        <Link href={categoryHref(query, sort)} className={!selectedType ? "active" : ""}>全部</Link>
        {PRODUCT_TYPES.map((type) => <Link key={type} href={categoryHref(query, sort, type)} className={selectedType === type ? "active" : ""}>{type}</Link>)}
      </div>
      <div className="market-subcategory-groups">
        {PRODUCT_TYPES.map((type) => (
          <section key={type} className="market-subcategory-group" aria-label={`${type} 子分类`}>
            <Link href={categoryHref(query, sort, type)} className={`market-subcategory-title${selectedType === type && !selectedCategory ? " active" : ""}`}>{type}</Link>
            <div className="market-sub-tabs">
              {categories[type].map((category) => (
                <Link
                  key={category}
                  href={categoryHref(query, sort, type, category)}
                  className={selectedType === type && selectedCategory === category ? "active" : ""}
                >{category}</Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </nav>
  );
}