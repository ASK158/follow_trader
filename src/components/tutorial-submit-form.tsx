"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RichTextEditor } from "@/components/rich-text-editor";
import type { ManagedTutorial } from "@/lib/tutorials";

export function TutorialSubmitForm({ tutorial }: { tutorial?: ManagedTutorial }) {
  const router = useRouter();
  const [kind, setKind] = useState<"article" | "video">(tutorial?.kind ?? "article");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setError("");
    const form = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const status = submitter instanceof HTMLButtonElement && submitter.value === "draft" ? "draft" : "published";
    form.set("status", status);
    try {
      const response = await fetch(tutorial ? `/api/admin/tutorials/${tutorial.id}` : "/api/admin/tutorials", {
        method: tutorial ? "PUT" : "POST",
        body: form,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setError(result.error ?? "保存失败"); return; }
      router.replace("/admin/tutorials?saved=1");
      router.refresh();
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!tutorial || !window.confirm("确定删除这篇教程吗？此操作无法撤销。")) return;
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/admin/tutorials/${tutorial.id}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setError(result.error ?? "删除失败"); return; }
      router.replace("/admin/tutorials");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="dev-form dev-product-form" onSubmit={(event) => void submit(event)}>
      <fieldset>
        <legend>教程类型与卡片介绍</legend>
        <div className="dev-form-grid">
          <label>教程类型
            <select name="kind" value={kind} onChange={(event) => setKind(event.target.value as "article" | "video")}>
              <option value="article">图文教程</option><option value="video">视频学习资源</option>
            </select>
          </label>
          <label>标题
            <input name="title" required minLength={2} maxLength={100} defaultValue={tutorial?.title} placeholder="例如：从交易规则到 MT5 策略" />
          </label>
          <label>分类
            <input name="category" required minLength={2} maxLength={30} defaultValue={tutorial?.category ?? "策略设计"} placeholder="策略设计 / MQL5 开发" />
          </label>
          <label>难度
            <select name="level" defaultValue={tutorial?.level ?? "入门"}><option>入门</option><option>进阶</option><option>实战</option></select>
          </label>
          <label>时长
            <input name="duration" required minLength={2} maxLength={30} defaultValue={tutorial?.duration ?? "10 分钟"} placeholder="例如：12 分钟" />
          </label>
          <label>主题色
            <input name="accent" type="color" defaultValue={tutorial?.accent ?? "#b4162b"} />
          </label>
        </div>
        <label>视频/图文卡片简介
          <textarea name="summary" required minLength={4} maxLength={200} rows={3} defaultValue={tutorial?.summary} placeholder="概括教程内容、适合人群和用户将学到什么。" />
        </label>
      </fieldset>

      {kind === "article" ? (
        <fieldset>
          <legend>图文教程正文</legend>
          <label>教程内容（支持标题、列表、颜色、链接和图片）
            <RichTextEditor name="content" defaultValue={tutorial?.kind === "article" ? tutorial.content ?? "" : ""} minHeight={420} placeholder="编写完整教程内容…" />
          </label>
          <small>教程中的图片复用平台上传存储；发布前正文至少需要 20 个字符。</small>
        </fieldset>
      ) : (
        <fieldset>
          <legend>第三方视频</legend>
          <div className="dev-form-grid">
            <label>视频平台
              <select name="platform" defaultValue={tutorial?.platform ?? "YouTube"}><option>YouTube</option><option>Bilibili</option><option>TikTok</option></select>
            </label>
            <label>视频链接
              <input name="externalUrl" type="url" required defaultValue={tutorial?.externalUrl} placeholder="https://www.youtube.com/watch?v=…" />
            </label>
          </div>
          <small>必须填写所选平台的 HTTPS 视频链接。用户点击视频卡片后将在新窗口打开第三方平台。</small>
        </fieldset>
      )}

      {error && <p className="dev-form-error" role="alert">{error}</p>}
      <div className="tutorial-form-actions">
        <button type="submit" name="status" value="draft" disabled={pending}>保存草稿</button>
        <button type="submit" name="status" value="published" disabled={pending}>{pending ? "保存中…" : tutorial?.status === "published" ? "更新并保持发布" : "发布教程"}</button>
        {tutorial && <button type="button" className="tutorial-delete-button" disabled={pending} onClick={() => void remove()}>删除教程</button>}
      </div>
      <small>草稿不会显示在教程中心；发布后将立即出现在对应的图文或视频区域。</small>
    </form>
  );
}
