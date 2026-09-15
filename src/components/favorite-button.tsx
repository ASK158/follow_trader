"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function FavoriteButton({ productId, initialFavorite, initialCount }: { productId: string; initialFavorite: boolean; initialCount: number }) {
  const router = useRouter();
  const [favorite, setFavorite] = useState(initialFavorite);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);

  async function toggleFavorite() {
    if (pending) return;
    const nextFavorite = !favorite;
    setFavorite(nextFavorite);
    setCount((current) => Math.max(0, current + (nextFavorite ? 1 : -1)));
    setPending(true);
    try {
      const response = await fetch(`/api/marketplace/favorites/${encodeURIComponent(productId)}`, {
        method: nextFavorite ? "PUT" : "DELETE",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "收藏失败");
      setFavorite(result.favorite);
      setCount(result.count);
      router.refresh();
    } catch {
      setFavorite(!nextFavorite);
      setCount((current) => Math.max(0, current + (nextFavorite ? -1 : 1)));
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      className={favorite ? "favorite-button active" : "favorite-button"}
      onClick={() => void toggleFavorite()}
      disabled={pending}
      aria-pressed={favorite}
      aria-label={favorite ? "取消收藏" : "收藏商品"}
    >
      <span aria-hidden="true">{favorite ? "♥" : "♡"}</span> {count} 次收藏
    </button>
  );
}
