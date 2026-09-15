"use client";

import Link from "next/link";
import { useState } from "react";

export function ForgotPasswordForm() {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    try {
      const email = String(new FormData(event.currentTarget).get("email") ?? "");
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const result = await response.json().catch(() => ({}));
      setMessage(result.resetUrl ? `${result.message} 开发环境链接：${result.resetUrl}` : result.message ?? result.error ?? "请求已处理");
    } catch { setMessage("网络异常，请稍后重试"); } finally { setPending(false); }
  }
  return <form className="dev-form" onSubmit={submit}><label>注册邮箱<input name="email" type="email" required maxLength={200} autoComplete="email" /></label>{message && <p role="status">{message}</p>}<button disabled={pending}>{pending ? "处理中…" : "发送重置链接"}</button><Link href="/developer/login">返回登录</Link></form>;
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    try {
      const password = String(new FormData(event.currentTarget).get("password") ?? "");
      const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const result = await response.json().catch(() => ({}));
      setSuccess(response.ok); setMessage(response.ok ? "密码已重置，所有旧设备会话均已退出。" : result.error ?? "重置失败");
    } catch { setMessage("网络异常，请稍后重试"); } finally { setPending(false); }
  }
  return <form className="dev-form" onSubmit={submit}><label>新密码 <small>至少 10 位，包含字母和数字</small><input name="password" type="password" required minLength={10} maxLength={100} autoComplete="new-password" /></label>{message && <p role="status">{message}</p>}{success ? <Link href="/developer/login">立即登录 →</Link> : <button disabled={pending}>{pending ? "保存中…" : "重置密码"}</button>}</form>;
}
