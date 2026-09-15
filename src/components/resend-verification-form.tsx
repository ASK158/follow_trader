"use client";
import { useState } from "react";
export function ResendVerificationForm() {
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const email = String(new FormData(event.currentTarget).get("email") ?? "");
    try { const response = await fetch("/api/auth/resend-verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }); const result = await response.json().catch(() => ({})); setMessage(result.verificationUrl ? `${result.message} 开发环境链接：${result.verificationUrl}` : result.message ?? result.error ?? "请求已处理"); } catch { setMessage("网络异常，请稍后重试"); }
  }
  return <form className="dev-form" onSubmit={submit}><label>注册邮箱<input name="email" type="email" required /></label>{message && <p role="status">{message}</p>}<button>重新发送验证邮件</button></form>;
}
