import type { ProductType } from "@/lib/marketplace/categories";

export type MarketplaceProduct = {
  id: string;
  name: string;
  type: ProductType;
  platform: "MT5" | "MT4" | "MT4 / MT5";
  category: string;
  tagline: string;
  description: string;
  price: number;
  version: string;
  updatedAt: string;
  developer: string;
  sales: number;
  rating: number;
  views?: number;
  favorites?: number;
  accent: string;
  coverImage?: string | null;
  features: string[];
  requirements: string[];
  gallery: Array<{ title: string; caption: string; variant: string }>;
  sourceFilename: string;
};

// 商城仅展示已审核通过的社区作品；不再提供内置演示策略。
export const marketplaceProducts: MarketplaceProduct[] = [];

export function getMarketplaceProduct(id: string) {
  return marketplaceProducts.find((product) => product.id === id);
}

export function getDemoSource(product: MarketplaceProduct) {
  return `// ${product.name} — DEMO SOURCE\n// This file demonstrates the post-purchase delivery pipeline.\n// Replace with the developer-provided source after real payment integration.\n#property strict\n\ninput double RiskPercent = 1.0;\n\nint OnInit()\n{\n   Print(\"${product.name} demo initialized\");\n   return(INIT_SUCCEEDED);\n}\n\nvoid OnTick()\n{\n   // Demo only: production trading logic is not included.\n}\n`;
}
