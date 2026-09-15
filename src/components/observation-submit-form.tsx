"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RichTextEditor } from "@/components/rich-text-editor";

export function ObservationSubmitForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/developer/observation-accounts", { method: "POST", body: new FormData(event.currentTarget) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error ?? "提交失败，请重试");
        return;
      }
      router.replace("/developer?tab=accounts&submittedAccount=1");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="dev-form dev-product-form">
      <fieldset>
        <legend>观摩账号信息</legend>
        <div className="dev-form-grid">
          <label>展示名称
            <input name="title" required minLength={2} maxLength={80} placeholder="例如：欧美趋势实盘观摩" />
          </label>
          <label>平台
            <select name="platform" defaultValue="MT5"><option value="MT5">MT5</option><option value="MT4">MT4</option></select>
          </label>
          <label>账号类型
            <select name="accountType" defaultValue="真实账号"><option value="真实账号">真实账号</option><option value="模拟账号">模拟账号</option></select>
          </label>
          <label>交易账号
            <input name="accountNumber" required inputMode="numeric" pattern="[0-9]{3,32}" autoComplete="off" placeholder="请输入 MT4 / MT5 登录账号" />
          </label>
          <label>服务器全称
            <input name="serverName" required minLength={2} maxLength={120} autoComplete="off" placeholder="例如：Broker-Live01" />
          </label>
          <label>观摩密码
            <input name="investorPassword" type="password" required minLength={4} maxLength={128} autoComplete="new-password" placeholder="只读投资者密码" />
            <small>密码将加密保存，并在观摩详情页提供给访问者。请勿填写交易主密码。</small>
          </label>
        </div>
        <label>图文介绍
          <RichTextEditor name="description" placeholder="介绍交易风格、品种周期、风险水平、运行时长和需要向观摩者说明的信息…" />
        </label>
      </fieldset>
      {error && <p className="dev-form-error" role="alert">{error}</p>}
      <button type="submit" disabled={pending}>{pending ? "提交中…" : "提交并上架"}</button>
      <small>观摩账号会直接显示在观摩空间。请确认使用的是只读观摩密码，切勿提交交易主密码。</small>
    </form>
  );
}