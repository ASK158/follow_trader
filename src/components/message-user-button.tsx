"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MessageUserButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    setPending(true); setError("");
    try {
      const response = await fetch("/api/messages/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId: userId }) });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) { router.push(`/developer/login?next=${encodeURIComponent(location.pathname)}`); return; }
      if (!response.ok) throw new Error(result.error ?? "无法发起消息会话");
      router.push(`/messages/${result.conversationId}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败"); setPending(false); }
  }
  return <div className="message-user-control"><button type="button" className="profile-secondary-button" onClick={start} disabled={pending}>{pending ? "正在打开…" : "消息"}</button>{error && <small role="alert">{error}</small>}</div>;
}
