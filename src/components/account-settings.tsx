"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { UserSession } from "@/lib/marketplace/auth";

type Props = { user: { name: string; email: string; role: string; emailVerified: boolean; mfaEnabled: boolean }; sessions: UserSession[] };

export function AccountSettings({ user, sessions: initialSessions }: Props) {
  const router = useRouter();
  const [sessions, setSessions] = useState(initialSessions);
  const [message, setMessage] = useState("");
  const [mfa, setMfa] = useState<{ secret: string; uri: string } | null>(null);
  async function jsonRequest(url: string, method: string, body?: unknown) {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "操作失败");
    return result;
  }
  async function updateName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage("");
    try { const name = String(new FormData(event.currentTarget).get("name") ?? ""); await jsonRequest("/api/account/profile", "PATCH", { name }); setMessage("名称已更新"); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "操作失败"); }
  }
  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); const form = new FormData(event.currentTarget);
    try { await jsonRequest("/api/account/password", "POST", { currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword") }); router.replace("/developer/login"); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "操作失败"); }
  }
  async function startMfa() { try { setMfa(await jsonRequest("/api/account/mfa", "POST")); } catch (error) { setMessage(error instanceof Error ? error.message : "操作失败"); } }
  async function confirmMfa(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); try { const code = String(new FormData(event.currentTarget).get("code") ?? ""); await jsonRequest("/api/account/mfa", "PUT", { code }); setMessage("二次验证已启用"); setMfa(null); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "操作失败"); } }
  async function turnOffMfa() { try { await jsonRequest("/api/account/mfa", "DELETE"); setMessage("二次验证已关闭"); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "操作失败"); } }
  async function revoke(sessionId: string) { try { await jsonRequest("/api/account/sessions", "DELETE", { sessionId }); setSessions((items) => items.filter((item) => item.id !== sessionId)); } catch (error) { setMessage(error instanceof Error ? error.message : "操作失败"); } }
  return <div className="dev-product-list">
    {message && <p className="dev-notice" role="status">{message}</p>}
    <section className="dev-auth-card"><h2>基本资料</h2><p>{user.email} · {user.emailVerified ? "邮箱已验证" : "邮箱未验证"} · {user.role === "admin" ? "管理员" : "用户"}</p><form className="dev-form" onSubmit={updateName}><label>显示名称<input name="name" defaultValue={user.name} minLength={2} maxLength={50} required /></label><button>保存资料</button></form></section>
    <section className="dev-auth-card"><h2>修改密码</h2><form className="dev-form" onSubmit={changePassword}><label>当前密码<input name="currentPassword" type="password" required autoComplete="current-password" /></label><label>新密码<input name="newPassword" type="password" minLength={10} required autoComplete="new-password" /></label><button>修改并退出所有设备</button></form></section>
    <section className="dev-auth-card"><h2>身份验证器（TOTP）</h2>{user.mfaEnabled ? <><p>已启用。登录时需要 6 位动态验证码。</p><button type="button" onClick={turnOffMfa}>关闭二次验证</button></> : mfa ? <><p>在身份验证器中手动输入密钥：</p><strong>{mfa.secret}</strong><details><summary>查看 otpauth 地址</summary><code>{mfa.uri}</code></details><form className="dev-form" onSubmit={confirmMfa}><label>动态验证码<input name="code" inputMode="numeric" pattern="[0-9]{6}" required /></label><button>确认启用</button></form></> : <button type="button" onClick={startMfa}>启用二次验证</button>}</section>
    <section className="dev-auth-card"><h2>登录设备</h2>{sessions.map((session) => <div className="dev-product-row" key={session.id}><div className="dev-product-info"><b>{session.current ? "当前设备" : "已登录设备"}</b><p>{session.userAgent ?? "未知客户端"}</p><small>最近活动：{session.lastSeenAt ? new Date(session.lastSeenAt).toLocaleString("zh-CN") : "未知"}</small></div>{!session.current && <button type="button" onClick={() => revoke(session.id)}>撤销</button>}</div>)}</section>
  </div>;
}
