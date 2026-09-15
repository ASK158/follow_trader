"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProductComment } from "@/lib/marketplace/comments";

type Props = {
  productId: string;
  comments: ProductComment[];
  currentUser: { id: string; name: string } | null;
  isAdmin?: boolean;
};

const dateFormatter = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

export function ProductComments({ productId, comments, currentUser, isAdmin = false }: Props) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submitComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const response = await fetch(`/api/marketplace/comments/${encodeURIComponent(productId)}`, {
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
    const response = await fetch(`/api/admin/comments/${encodeURIComponent(commentId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hidden: true, note: "管理员在商品页隐藏" }) });
    if (response.ok) router.refresh();
  }

  return (
    <section className="product-comments" aria-labelledby="product-comments-title">
      <header>
        <div><span className="panel-code">USER DISCUSSION</span><h2 id="product-comments-title">用户评论</h2></div>
        <b>{comments.length} 条评论</b>
      </header>
      {currentUser ? (
        <form className="comment-form" onSubmit={submitComment}>
          <label htmlFor="comment-content">以 {currentUser.name} 的身份发表评论</label>
          <textarea id="comment-content" value={content} onChange={(event) => setContent(event.target.value)} required minLength={2} maxLength={1000} rows={4} placeholder="分享你的使用体验、参数建议或问题…" />
          <div><small>{content.length} / 1000</small>{error && <p role="alert">{error}</p>}<button type="submit" disabled={pending || content.trim().length < 2}>{pending ? "发布中…" : "发布评论"}</button></div>
        </form>
      ) : (
        <div className="comment-login-prompt"><b>登录后参与讨论</b><p>注册账户后即可发表评论，也可以在个人中心上架自己的产品。</p><Link href={`/developer/login?next=${encodeURIComponent(`/marketplace/${productId}`)}`}>注册/登录 →</Link></div>
      )}
      <div className="comment-list">
        {comments.length ? comments.map((comment) => (
          <article key={comment.id}>
            <div className="comment-avatar" aria-hidden="true">{comment.userName.trim().charAt(0).toLocaleUpperCase("zh-CN")}</div>
            <div><header><b>{comment.userName}{comment.verifiedBuyer && <em className="dev-status status-approved">已购用户</em>}</b><time dateTime={comment.createdAt}>{dateFormatter.format(new Date(comment.createdAt))}</time></header><p>{comment.content}</p>{isAdmin && <button type="button" onClick={() => void hideComment(comment.id)}>隐藏评论</button>}</div>
          </article>
        )) : <p className="comment-empty">还没有评论，登录后发表第一条评论。</p>}
      </div>
    </section>
  );
}