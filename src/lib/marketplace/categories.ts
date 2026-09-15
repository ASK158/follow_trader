export const PRODUCT_CATEGORIES = {
  EA: ["马丁", "网格", "趋势", "震荡", "多货币", "多策略组合", "剥头皮", "机器学习"],
  指标: ["趋势", "震荡", "通道", "量能", "形态", "多周期", "多货币"],
  其他工具: ["跟单", "统计", "风控", "面板", "可视化", "脚本"],
} as const;

export type ProductType = keyof typeof PRODUCT_CATEGORIES;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[ProductType][number];

export const PRODUCT_TYPES = Object.keys(PRODUCT_CATEGORIES) as ProductType[];

export function isProductType(value: string): value is ProductType {
  return PRODUCT_TYPES.includes(value as ProductType);
}

export function isProductCategory(type: ProductType, value: string): value is ProductCategory {
  return (PRODUCT_CATEGORIES[type] as readonly string[]).includes(value);
}
