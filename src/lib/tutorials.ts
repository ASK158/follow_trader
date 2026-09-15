import { randomBytes } from "node:crypto";
import { getMarketplaceDb } from "@/lib/marketplace/db";
import { richTextPlainText, sanitizeProductDescription } from "@/lib/marketplace/rich-text";
import { tutorials as builtInTutorials, type Tutorial } from "@/lib/tutorial-data";

export type TutorialStatus = "draft" | "published";
export type ManagedTutorial = Tutorial & {
  authorId: string;
  content: string | null;
  status: TutorialStatus;
  createdAt: string;
  updatedAt: string;
};

export type TutorialInput = {
  kind: Tutorial["kind"];
  title: string;
  summary: string;
  category: string;
  level: Tutorial["level"];
  duration: string;
  platform?: Tutorial["platform"];
  externalUrl?: string;
  content?: string;
  accent: string;
  status: TutorialStatus;
};

type TutorialRow = {
  id: string; author_id: string; kind: Tutorial["kind"]; title: string; summary: string;
  category: string; level: Tutorial["level"]; duration: string; platform: Tutorial["platform"] | null;
  external_url: string | null; content: string | null; accent: string; status: TutorialStatus;
  created_at: string; updated_at: string;
};

function rowToTutorial(row: TutorialRow): ManagedTutorial {
  return {
    id: row.id,
    authorId: row.author_id,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    category: row.category,
    level: row.level,
    duration: row.duration,
    platform: row.platform ?? undefined,
    externalUrl: row.external_url ?? undefined,
    content: row.content,
    accent: row.accent,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listManagedTutorials(): ManagedTutorial[] {
  return (getMarketplaceDb().prepare("SELECT * FROM tutorials ORDER BY updated_at DESC").all() as TutorialRow[]).map(rowToTutorial);
}

export function listPublishedTutorials(): Tutorial[] {
  const managed = (getMarketplaceDb().prepare("SELECT * FROM tutorials WHERE status = 'published' ORDER BY updated_at DESC").all() as TutorialRow[]).map(rowToTutorial);
  return [...managed, ...builtInTutorials];
}

export function getManagedTutorial(id: string): ManagedTutorial | null {
  const row = getMarketplaceDb().prepare("SELECT * FROM tutorials WHERE id = ?").get(id) as TutorialRow | undefined;
  return row ? rowToTutorial(row) : null;
}

export function getPublishedTutorial(id: string): Tutorial | null {
  const row = getMarketplaceDb().prepare("SELECT * FROM tutorials WHERE id = ? AND status = 'published'").get(id) as TutorialRow | undefined;
  return row ? rowToTutorial(row) : builtInTutorials.find((tutorial) => tutorial.id === id) ?? null;
}

export function validateTutorialForm(formData: FormData): { input?: TutorialInput; error?: string } {
  const kind = formData.get("kind");
  const title = String(formData.get("title") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const level = formData.get("level");
  const duration = String(formData.get("duration") ?? "").trim();
  const accent = String(formData.get("accent") ?? "");
  const status = formData.get("status");
  if (kind !== "article" && kind !== "video") return { error: "请选择教程类型" };
  if (title.length < 2 || title.length > 100) return { error: "标题需要 2 至 100 个字符" };
  if (summary.length < 4 || summary.length > 200) return { error: "卡片简介需要 4 至 200 个字符" };
  if (category.length < 2 || category.length > 30) return { error: "分类需要 2 至 30 个字符" };
  if (level !== "入门" && level !== "进阶" && level !== "实战") return { error: "请选择难度" };
  if (duration.length < 2 || duration.length > 30) return { error: "时长需要 2 至 30 个字符" };
  if (!/^#[0-9a-fA-F]{6}$/.test(accent)) return { error: "主题色格式不正确" };
  if (status !== "draft" && status !== "published") return { error: "教程状态不正确" };

  if (kind === "article") {
    const content = sanitizeProductDescription(String(formData.get("content") ?? ""));
    if (richTextPlainText(content).length < 20) return { error: "图文教程正文至少 20 个字符" };
    return { input: { kind, title, summary, category, level, duration, accent, status, content } };
  }

  const platform = formData.get("platform");
  if (platform !== "YouTube" && platform !== "Bilibili" && platform !== "TikTok") return { error: "请选择视频平台" };
  const externalUrl = String(formData.get("externalUrl") ?? "").trim();
  let url: URL;
  try { url = new URL(externalUrl); } catch { return { error: "请输入完整的视频链接" }; }
  if (url.protocol !== "https:") return { error: "视频链接必须使用 HTTPS" };
  const allowedHosts: Record<NonNullable<Tutorial["platform"]>, RegExp> = {
    YouTube: /(^|\.)(youtube\.com|youtu\.be)$/i,
    Bilibili: /(^|\.)(bilibili\.com|b23\.tv)$/i,
    TikTok: /(^|\.)(tiktok\.com|vm\.tiktok\.com)$/i,
  };
  if (!allowedHosts[platform].test(url.hostname)) return { error: `链接与所选 ${platform} 平台不匹配` };
  return { input: { kind, title, summary, category, level, duration, accent, status, platform, externalUrl: url.toString() } };
}

export function createTutorial(authorId: string, input: TutorialInput): ManagedTutorial {
  const id = `tutorial-${randomBytes(8).toString("hex")}`;
  const now = new Date().toISOString();
  getMarketplaceDb().prepare(`
    INSERT INTO tutorials (id, author_id, kind, title, summary, category, level, duration, platform, external_url, content, accent, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, authorId, input.kind, input.title, input.summary, input.category, input.level, input.duration, input.platform ?? null, input.externalUrl ?? null, input.content ?? null, input.accent, input.status, now, now);
  return getManagedTutorial(id)!;
}

export function updateTutorial(id: string, input: TutorialInput): boolean {
  return getMarketplaceDb().prepare(`
    UPDATE tutorials SET kind = ?, title = ?, summary = ?, category = ?, level = ?, duration = ?, platform = ?, external_url = ?, content = ?, accent = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).run(input.kind, input.title, input.summary, input.category, input.level, input.duration, input.platform ?? null, input.externalUrl ?? null, input.content ?? null, input.accent, input.status, new Date().toISOString(), id).changes > 0;
}

export function deleteTutorial(id: string): boolean {
  return getMarketplaceDb().prepare("DELETE FROM tutorials WHERE id = ?").run(id).changes > 0;
}
