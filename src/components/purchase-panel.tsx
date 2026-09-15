"use client";

import Link from "next/link";
import { useState } from "react";
import { formatGa } from "@/lib/marketplace/currency";

type Props = { productId: string; productName: string; price: number; filename: string; isTemplate?: boolean; currentUserEmail?: string; currentUserBalance?: number };

type ConfirmedOrder = { orderId: string; downloadUrl: string };

export function PurchasePanel({ productId, productName, price, filename, isTemplate = false, currentUserEmail, currentUserBalance }: Props) {
  const [order, setOrder] = useState<ConfirmedOrder | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [balance, setBalance] = useState(currentUserBalance);

  async function handlePurchase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/marketplace/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error ?? "下单失败，请重试");
        return;
      }
      setBalance(result.balance);
      setOrder({ orderId: result.order.id, downloadUrl: result.downloadUrl });
    } finally {
      setPending(false);
    }
  }

  return (
    <aside className="purchase-panel">
      <span className="panel-code">LICENSE / SOURCE DELIVERY</span>
      <h2>{formatGa(price)}</h2>
      <p>{isTemplate ? "包含策略逻辑、配置框架与风险提示说明，不包含 EA、指标或可执行文件。" : "包含开发者提供的源码、参数说明和当前版本更新。订单确认后开放下载。"}</p>
      <ul>
        <li>{isTemplate ? "交付文件" : "源码文件"}：{filename}</li>
        <li>订单入库并生成下载凭证</li>
        <li>使用 Gas 积分支付，订单确认时即时扣除</li>
      </ul>
      {!currentUserEmail ? <div className="comment-login-prompt"><b>登录后购买</b><p>订单、下载凭证和购买记录将绑定到统一账户。</p><Link href={`/developer/login?next=${encodeURIComponent(`/marketplace/${productId}`)}`}>注册/登录 →</Link></div> : !order ? (
        <form onSubmit={handlePurchase} className="purchase-form">
          <p>订单账户：{currentUserEmail}</p>
          <p>可用余额：<b>{formatGa(balance ?? 0)}</b></p>
          {error && <p className="dev-form-error" role="alert">{error}</p>}
          <button type="submit" disabled={pending || (balance ?? 0) < price}>{pending ? "确认中…" : (balance ?? 0) < price ? "Gas 余额不足" : `支付 ${formatGa(price)} 并解锁`}</button>
        </form>
      ) : (
        <div className="purchase-unlocked">
          <b>✓ 订单已确认（{order.orderId}）</b>
          <a href={order.downloadUrl} download>{`下载 ${productName}${isTemplate ? " 策略模板说明" : " 源码"}`}</a>
        </div>
      )}
      <small>Gas 消费记录会写入账户账本；下载凭证与订单绑定，请勿外传。</small>
    </aside>
  );
}
