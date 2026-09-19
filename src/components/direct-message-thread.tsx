"use client";

import { useState } from "react";
import type { DirectMessage } from "@/lib/marketplace/messages";

export function DirectMessageThread({ conversationId, currentUserId, initialMessages }: { conversationId: string; currentUserId: string; initialMessages: DirectMessage[] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const content = String(new FormData(form).get("content") ?? "").trim();
    if (!content) return;
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/messages/${conversationId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "发送失败");
      setMessages((items) => [...items, result.message]); form.reset();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "发送失败"); }
    finally { setPending(false); }
  }
  return <div className="message-thread"><div className="message-list">{messages.length ? messages.map((message) => <article key={message.id} className={`direct-message${message.senderId === currentUserId ? " own" : ""}`}><p>{message.content}</p><small>{new Date(message.createdAt).toLocaleString("zh-CN")}</small></article>) : <div className="profile-empty">还没有消息，发送第一条问候吧。</div>}</div><form className="message-composer" onSubmit={submit}><label htmlFor="message-content">发送消息</label><textarea id="message-content" name="content" maxLength={2000} rows={4} required placeholder="输入消息内容……" /><div><small>{error || "请勿发送密码、密钥或其他敏感信息。"}</small><button disabled={pending}>{pending ? "发送中…" : "发送"}</button></div></form></div>;
}
