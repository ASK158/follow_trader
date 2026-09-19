"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function FollowButton({ userId, initialFollowing, initialCount }: { userId: string; initialFollowing: boolean; initialCount: number }) {
  const router = useRouter();
  const [following, setFollowingState] = useState(initialFollowing);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function toggle() {
    const next = !following;
    setFollowingState(next); setCount((value) => Math.max(0, value + (next ? 1 : -1))); setPending(true); setError("");
    try {
      const response = await fetch(`/api/users/${userId}/follow`, { method: next ? "PUT" : "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) { router.push(`/developer/login?next=${encodeURIComponent(location.pathname)}`); return; }
      if (!response.ok) throw new Error(result.error ?? "操作失败");
      setCount(result.followerCount);
      router.refresh();
    } catch (reason) {
      setFollowingState(!next); setCount((value) => Math.max(0, value + (next ? -1 : 1)));
      setError(reason instanceof Error ? reason.message : "操作失败");
    } finally { setPending(false); }
  }
  return <div className="follow-control"><button type="button" className={`follow-button${following ? " following" : ""}`} onClick={toggle} disabled={pending}>{pending ? "处理中…" : following ? "已关注" : "关注"} · {count}</button>{error && <small role="alert">{error}</small>}</div>;
}
