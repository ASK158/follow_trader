"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

export function DeveloperAuthForm({ nextPath = "/developer" }: { nextPath?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [verificationUrl, setVerificationUrl] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);

  function registrationDeviceId() {
    const key = "sigma-registration-device-v1";
    const value = crypto.randomUUID();
    try {
      const existing = localStorage.getItem(key);
      if (existing) return existing;
      localStorage.setItem(key, value);
    } catch {
      // 隐私模式可能禁用持久化；服务端仍会应用邮箱验证与 IP 限额。
    }
    return value;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    const payload = {
      email: form.get("email"),
      password: form.get("password"),
      ...(mode === "register" ? { name: form.get("name"), deviceId: registrationDeviceId() } : {}),
    };
    try {
      const response = await fetch(`/api/developer/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error ?? "操作失败，请重试");
        return;
      }
      if (result.verificationRequired) {
        setNotice("注册成功。请查收验证邮件，验证后再登录。");
        setVerificationUrl(result.verificationUrl ?? "");
        setMode("login");
        return;
      }
      if (result.mfaRequired) {
        setMfaRequired(true);
        setNotice("请输入身份验证器中的 6 位动态验证码。");
        return;
      }
      router.replace(nextPath);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function verifyMfa(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    try {
      const code = String(new FormData(event.currentTarget).get("code") ?? "");
      const response = await fetch("/api/auth/mfa/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setError(result.error ?? "验证失败"); return; }
      router.replace(nextPath); router.refresh();
    } catch { setError("网络异常，请稍后重试"); } finally { setPending(false); }
  }

  if (mfaRequired) return <div className="dev-auth-card"><span className="panel-code">TWO-FACTOR AUTH</span><h2>二次验证</h2><p>{notice}</p><form onSubmit={verifyMfa} className="dev-form"><label>动态验证码<input name="code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoComplete="one-time-code" /></label>{error && <p className="dev-form-error" role="alert">{error}</p>}<button disabled={pending}>{pending ? "验证中…" : "验证并登录"}</button></form></div>;

  return (
    <div className="dev-auth-card">
      <div className="dev-auth-tabs" role="tablist">
        <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>登录</button>
        <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>注册账户</button>
      </div>
      <form onSubmit={handleSubmit} className="dev-form">
        {mode === "register" && (
          <label>用户名 / 团队名称
            <input name="name" required minLength={2} maxLength={50} placeholder="例如：Sigma Quant Lab" />
          </label>
        )}
        <label>邮箱
          <input name="email" type="email" required maxLength={200} placeholder="you@example.com" autoComplete="email" />
        </label>
        <label>密码{mode === "register" && <small>（至少 10 位，包含字母和数字）</small>}
          <input name="password" type="password" required minLength={mode === "register" ? 10 : 1} maxLength={100} autoComplete={mode === "register" ? "new-password" : "current-password"} />
        </label>
        {error && <p className="dev-form-error" role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {verificationUrl && <a href={verificationUrl}>开发环境：立即验证邮箱</a>}
        <button type="submit" disabled={pending}>{pending ? "处理中…" : mode === "login" ? "登录账户" : "注册并发送验证邮件"}</button>
      </form>
      {mode === "login" && <Link href="/account/forgot-password">忘记密码？</Link>}
      {mode === "login" && <Link href="/account/resend-verification">没有收到验证邮件？</Link>}
      <small>用户可购买、评论和上架作品；会话使用安全的 httpOnly Cookie，7 天有效。</small>
    </div>
  );
}
