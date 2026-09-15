"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReviewPanel({ productId }: { productId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function review(decision: "approved" | "rejected") {
    setError("");
    setPending(true);
    try {
      const response = await fetch(`/api/admin/products/${productId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note.trim() || undefined }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error ?? "操作失败");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="review-panel">
      <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="审核备注（驳回时必填，将展示给开发者）" rows={2} maxLength={500} />
      {error && <p className="dev-form-error" role="alert">{error}</p>}
      <div>
        <button type="button" onClick={() => review("approved")} disabled={pending}>✓ 通过并上架</button>
        <button type="button" className="review-reject" onClick={() => review("rejected")} disabled={pending}>× 驳回</button>
      </div>
    </div>
  );
}
