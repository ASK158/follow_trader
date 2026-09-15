import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getMarketplaceStorageDirectory } from "./db";
import type { ProductInput } from "./products";
import { richTextPlainText, sanitizeProductDescription } from "./rich-text";
import { isProductCategory } from "./categories";

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const ALLOWED_SOURCE_EXTENSIONS = [".mq5", ".mq4", ".ex5", ".ex4"];
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const ALLOWED_COVER_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

const listField = z.array(z.string().min(1).max(200)).min(1, "至少填写一条").max(20);

/** 富文本 HTML：按纯文本长度校验，防止空内容与超大提交 */
const richTextField = z.string()
  .max(200_000, "详细介绍过长")
  .transform(sanitizeProductDescription)
  .refine((html) => richTextPlainText(html).length >= 20, "详细介绍至少 20 个字符");

export const productFormSchema = z.object({
  name: z.string().min(2, "名称至少 2 个字符").max(80),
  type: z.enum(["EA", "指标", "其他工具"]),
  platform: z.enum(["MT5", "MT4"]),
  category: z.string().min(1, "请选择子分类").max(30),
  tagline: z.string().min(4, "一句话简介至少 4 个字符").max(120),
  description: richTextField,
  price: z.number().int("Gas 定价必须是整数").min(0, "价格不能为负").max(1_000_000),
  version: z.string().min(1).max(20),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, "主题色需为 #RRGGBB 格式"),
  requirements: listField,
  isTemplate: z.boolean(),
}).refine((data) => isProductCategory(data.type, data.category), {
  message: "请选择与主分类匹配的子分类",
  path: ["category"],
});

export type ParsedProductForm = {
  input: Omit<ProductInput, "sourceFilename" | "sourcePath" | "coverImage">;
  sourceFile: File | null;
  coverFile: File | null;
  removeCover: boolean;
};

function parseListField(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return [];
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

export function parseProductForm(formData: FormData): { data?: ParsedProductForm; error?: string } {
  const parsed = productFormSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    platform: formData.get("platform"),
    category: formData.get("category"),
    tagline: formData.get("tagline"),
    description: formData.get("description"),
    price: Number(formData.get("price")),
    version: formData.get("version"),
    accent: formData.get("accent"),
    requirements: parseListField(formData.get("requirements")),
    isTemplate: formData.get("isTemplate") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "表单内容不正确" };
  }
  const sourceEntry = formData.get("source");
  const sourceFile = sourceEntry instanceof File && sourceEntry.size > 0 ? sourceEntry : null;
  if (sourceFile) {
    if (sourceFile.size > MAX_SOURCE_BYTES) {
      return { error: "文件不能超过 10MB" };
    }
    const lowerName = sourceFile.name.toLowerCase();
    if (!ALLOWED_SOURCE_EXTENSIONS.some((extension) => lowerName.endsWith(extension))) {
      return { error: "仅支持 .mq5 / .mq4 / .ex5 / .ex4 文件" };
    }
  }
  const coverEntry = formData.get("cover");
  const coverFile = coverEntry instanceof File && coverEntry.size > 0 ? coverEntry : null;
  if (coverFile) {
    if (coverFile.size > MAX_COVER_BYTES) {
      return { error: "封面图片不能超过 5MB" };
    }
    if (!ALLOWED_COVER_TYPES[coverFile.type]) {
      return { error: "封面图片仅支持 PNG / JPG / WebP 格式" };
    }
  }
  return { data: { input: parsed.data, sourceFile, coverFile, removeCover: formData.get("removeCover") === "on" } };
}

/** 将上传的源码保存到商品专属目录，返回存储用的文件名与绝对路径 */
export async function saveSourceFile(productId: string, file: File): Promise<{ filename: string; path: string }> {
  const safeName = file.name.replace(/[^\w.\-一-龥]/g, "_").slice(-80);
  const filename = `${Date.now()}-${safeName}`;
  const directory = join(getMarketplaceStorageDirectory(), productId);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, filename);
  writeFileSync(path, Buffer.from(await file.arrayBuffer()));
  return { filename: file.name, path };
}

/** 将商城封面保存到公开图片目录，返回站内访问 URL */
export async function saveCoverImage(file: File): Promise<string> {
  const extension = ALLOWED_COVER_TYPES[file.type];
  if (!extension) throw new Error("不支持的封面图片格式");
  const filename = `${Date.now()}-${randomBytes(6).toString("hex")}${extension}`;
  const directory = join(getMarketplaceStorageDirectory(), "images");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, filename), Buffer.from(await file.arrayBuffer()));
  return `/api/marketplace/images/${filename}`;
}

export function newProductId(): string {
  return `dev-${randomBytes(6).toString("hex")}`;
}
