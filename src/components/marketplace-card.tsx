import Link from "next/link";
import { FavoriteButton } from "@/components/favorite-button";
import { formatGa } from "@/lib/marketplace/currency";
import type { CatalogProduct } from "@/lib/marketplace/products";

const typeClass = { EA: "ea", 指标: "indicator", 其他工具: "tool" } as const;

export function MarketplaceCard({ product, isFavorite = false }: { product: CatalogProduct; isFavorite?: boolean }) {
  return (
    <article className={`market-card market-card--${typeClass[product.type]}`}>
      <Link href={`/marketplace/${product.id}`} className="market-card-cover-link">
        <div className={`product-cover${product.coverImage ? " product-cover--image" : ""}`} style={{ "--product-accent": product.accent, "--product-cover-image": product.coverImage ? `url(${JSON.stringify(product.coverImage)})` : undefined } as React.CSSProperties}>
          <div className="product-cover-tags"><span>{product.type}</span><span>{product.category}</span></div>
          <small>{product.platform} · {product.isTemplate ? "STRATEGY TEMPLATE" : "SOURCE INCLUDED"}</small><i>Σ</i>
        </div>
      </Link>
      <div className="market-card-body">
        <Link href={`/marketplace/${product.id}`}><h2>{product.name}</h2><p>{product.tagline}</p></Link>
        <div className="product-rating"><span>◉ {product.views} 次浏览</span><FavoriteButton productId={product.id} initialFavorite={isFavorite} initialCount={product.favorites} /></div>
        <footer><b>{formatGa(product.price)}</b><Link href={`/marketplace/${product.id}`}>查看详情 →</Link></footer>
      </div>
    </article>
  );
}
