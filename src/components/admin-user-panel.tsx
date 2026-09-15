"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminUserRecord } from "@/lib/auth/admin";
import { formatGa } from "@/lib/marketplace/currency";

export function AdminUserPanel({ users }: { users: AdminUserRecord[] }) {
  const router = useRouter(); const [error, setError] = useState(""); const [pending, setPending] = useState("");
  async function update(userId: string, role: "user" | "admin", status: "active" | "suspended") {
    setPending(userId); setError("");
    try { const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, status }) }); const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error ?? "更新失败"); router.refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "更新失败"); } finally { setPending(""); }
  }
  return <section className="dev-product-list">{error && <p className="dev-form-error">{error}</p>}{users.map((user) => <article className="dev-product-row" key={user.id}><div className="dev-product-info"><div><b>{user.name}</b><span className={`dev-status ${user.status === "active" ? "status-approved" : "status-rejected"}`}>{user.status === "active" ? "启用" : "停用"}</span></div><p>{user.email} · {user.emailVerified ? "邮箱已验证" : "邮箱未验证"} · {user.mfaEnabled ? "已启用 MFA" : "未启用 MFA"}</p><small>余额 {formatGa(user.gaBalance)} · 作品 {user.productCount} · 订单 {user.orderCount} · 注册 {new Date(user.createdAt).toLocaleString("zh-CN")} · 最近登录 {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("zh-CN") : "从未"}</small></div><div className="dev-product-actions"><button disabled={pending === user.id} onClick={() => update(user.id, user.role === "admin" ? "user" : "admin", user.status)}>{user.role === "admin" ? "降为用户" : "设为管理员"}</button><button disabled={pending === user.id} onClick={() => update(user.id, user.role, user.status === "active" ? "suspended" : "active")}>{user.status === "active" ? "停用" : "启用"}</button></div></article>)}</section>;
}
