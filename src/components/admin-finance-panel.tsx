"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminUserRecord } from "@/lib/auth/admin";
import { formatGa } from "@/lib/marketplace/currency";

export function AdminFinancePanel({ users }: { users: AdminUserRecord[] }) {
  const router = useRouter();
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function adjust(event: React.FormEvent<HTMLFormElement>, user: AdminUserRecord) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(user.id); setError(""); setNotice("");
    const form = new FormData(formElement);
    const operation = String(form.get("operation"));
    const amount = Number(form.get("amount"));
    const reason = String(form.get("reason") ?? "");
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/ga`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation, amount, reason }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "积分调整失败");
      setNotice(`${user.name} 的余额已更新为 ${formatGa(result.balance)}`);
      formElement.reset();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "积分调整失败");
    } finally {
      setPending("");
    }
  }

  return (
    <section className="finance-user-list" aria-label="用户 Gas 积分管理">
      {error && <p className="dev-form-error" role="alert">{error}</p>}
      {notice && <p className="dev-notice" role="status">{notice}</p>}
      {users.map((user) => (
        <article className="finance-user-row" key={user.id}>
          <div className="dev-product-info">
            <div><b>{user.name}</b><span className="ga-balance">{formatGa(user.gaBalance)}</span></div>
            <p>{user.email} · {user.status === "active" ? "账户启用" : "账户停用"} · 订单 {user.orderCount}</p>
            <small>注册风险 {user.registrationRiskScore} · {user.agentFreeEligible ? "可用 Agent 免费额度" : "已取消 Agent 免费额度"}{user.registrationRiskFlags.length ? ` · ${user.registrationRiskFlags.join(", ")}` : ""}</small>
          </div>
          <form className="finance-adjust-form" onSubmit={(event) => adjust(event, user)}>
            <select name="operation" aria-label="积分操作" defaultValue="grant">
              <option value="grant">发放</option>
              <option value="deduct">扣减</option>
            </select>
            <input name="amount" type="number" min="1" max="10000000" step="1" required placeholder="Gas 数量" aria-label="Gas 数量" />
            <input name="reason" minLength={2} maxLength={200} required placeholder="调整原因" aria-label="调整原因" />
            <button disabled={pending === user.id}>{pending === user.id ? "处理中…" : "确认调整"}</button>
          </form>
        </article>
      ))}
    </section>
  );
}