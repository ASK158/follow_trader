"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ObservationComment } from "@/lib/observation-comments";

type Props = {
  accountId: string;
  comments: ObservationComment[];
  currentUser: { name: string } | null;
  isAdmin?: boolean;
};

const dateFormatter = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

export function ObservationComments({ accountId, comments, currentUser, isAdmin = false }: Props) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submitComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const response = await fetch(`/api/observation/comments/${encodeURIComponent(accountId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error ?? "评论发布失败，请重试");
        return;
      }
      setContent("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function hideComment(commentId: string) {
    const response = await fetch(`/api/admin/observation-comments/${encodeURIComponent(commentId)}`, { method: "PATCH" });
    if (response.ok) router.refresh();
  }

  return (
    <section className="product-comments" aria-labelledby="observation-comments-title">
      <header><div><span className="panel-code">VIEWER DISCUSSION</span><h2 id="observation-comments-title">观摩讨论</h2></div><b>{comments.length} 条评论</b></header>
      {currentUser ? (
        <form className="comment-form" onSubmit={submitComment}>
          <label htmlFor="observation-comment">以 {currentUser.name} 的身份发表评论</label>
          <textarea id="observation-comment" value={content} onChange={(event) => setContent(event.target.value)} required minLength={2} maxLength={1000} rows={4} placeholder="交流交易风格、运行情况或观摩问题…" />
          <div><small>{content.length} / 1000</small>{error && <p role="alert">{error}</p>}<button type="submit" disabled={pending || content.trim().length < 2}>{pending ? "发布中…" : "发布评论"}</button></div>
        </form>
      ) : (
        <div className="comment-login-prompt"><b>登录后参与讨论</b><p>注册账户后即可对观摩账号发表评论。</p><Link href={`/developer/login?next=${encodeURIComponent(`/observation/${accountId}`)}`}>注册/登录 →</Link></div>
      )}
      <div className="comment-list">
        {comments.length ? comments.map((comment) => (
          <article key={comment.id}><div className="comment-avatar" aria-hidden="true">{comment.userName.trim().charAt(0).toLocaleUpperCase("zh-CN")}</div><div><header><b>{comment.userName}</b><time dateTime={comment.createdAt}>{dateFormatter.format(new Date(comment.createdAt))}</time></header><p>{comment.content}</p>{isAdmin && <button type="button" onClick={() => void hideComment(comment.id)}>隐藏评论</button>}</div></article>
        )) : <p className="comment-empty">还没有评论，登录后发表第一条评论。</p>}
      </div>
    </section>
  );
}