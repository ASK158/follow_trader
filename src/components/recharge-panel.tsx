"use client";

import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { formatGa } from "@/lib/marketplace/currency";
import type { Recharge, RechargeStatus } from "@/lib/payments/recharges";

const statusLabels: Record<RechargeStatus, string> = {
  creating: "正在创建", waiting: "等待付款", confirming: "链上确认中", confirmed: "已确认", sending: "正在结算",
  review_required: "需要人工处理", credited: "已到账", expired: "已过期", failed: "失败", cancelled: "已取消",
};

export function RechargePanel({ initialRecharges, emailVerified }: { initialRecharges: Recharge[]; emailVerified: boolean }) {
  const router = useRouter();
  const [amount, setAmount] = useState("2.00");
  const [recharges, setRecharges] = useState(initialRecharges);
  const [active, setActive] = useState<Recharge | null>(initialRecharges.find((item) => ["waiting", "confirming", "confirmed", "sending"].includes(item.status)) ?? null);
  const [qr, setQr] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!active?.payAddress) return;
    let cancelled = false;
    QRCode.toDataURL(active.payAddress, { width: 240, margin: 1, errorCorrectionLevel: "M" }).then((value) => { if (!cancelled) setQr(value); }).catch(() => { if (!cancelled) setQr(""); });
    return () => { cancelled = true; };
  }, [active?.payAddress]);

  const hasPending = useMemo(() => recharges.some((item) => ["waiting", "confirming", "confirmed", "sending"].includes(item.status)), [recharges]);
  useEffect(() => {
    if (!hasPending) return;
    const timer = window.setInterval(async () => {
      const response = await fetch("/api/account/recharges", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { recharges: Recharge[] };
      setRecharges(data.recharges);
      setActive((current) => current ? data.recharges.find((item) => item.id === current.id) ?? current : current);
      if (data.recharges.some((item) => item.status === "credited")) router.refresh();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [hasPending, router]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(""); setCopied(false);
    try {
      const response = await fetch("/api/account/recharges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: Number(amount) }) });
      const result = await response.json().catch(() => ({})) as { recharge?: Recharge; error?: string };
      if (!response.ok || !result.recharge) throw new Error(result.error ?? "创建充值单失败");
      setActive(result.recharge); setRecharges((items) => [result.recharge!, ...items]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "创建充值单失败"); }
    finally { setPending(false); }
  }

  async function copyAddress() {
    if (!active?.payAddress) return;
    try { await navigator.clipboard.writeText(active.payAddress); setCopied(true); }
    catch { setError("无法自动复制，请手动选择地址复制"); }
  }

  return <>
    <section className="recharge-layout">
      <form className="dev-form recharge-card" onSubmit={create}>
        <div><span className="panel-code">CREATE PAYMENT</span><h2>充值 Gas</h2><p>使用 USDT-TRC20 充值，1 USDT = 1 Gas。</p></div>
        {!emailVerified && <p className="dev-form-error">邮箱尚未验证，暂时不能创建充值单。</p>}
        {error && <p className="dev-form-error" role="alert">{error}</p>}
        <label>充值金额（USDT）<input type="number" min="2" max="500" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required disabled={!emailVerified || pending} /><small>单笔最低 2 USDT，最高 500 USDT，到账后按两位小数计入 Gas。</small></label>
        <button disabled={!emailVerified || pending}>{pending ? "正在创建…" : "生成充值地址"}</button>
        <small>每笔充值使用独立地址。请勿向过期地址重复转账；不支持提现、转让或自动退款。</small>
      </form>
      <article className="recharge-card recharge-payment">
        <div><span className="panel-code">USDT / TRC20</span><h2>{active ? statusLabels[active.status] : "等待创建充值单"}</h2></div>
        {active?.payAddress ? <>
          {qr && <Image src={qr} alt="USDT-TRC20 充值地址二维码" width={240} height={240} unoptimized />}
          <div className="recharge-amount"><small>应付金额</small><b>{active.payAmount ?? active.amount.toFixed(2)} USDT</b></div>
          <code>{active.payAddress}</code>
          <button type="button" className="dev-secondary-action" onClick={copyAddress}>{copied ? "已复制" : "复制地址"}</button>
          <p className="recharge-warning">仅可通过 TRON（TRC20）网络发送 USDT。币种或网络错误可能导致资金无法找回。</p>
          {active.expiresAt && <small>支付地址有效期以服务商状态为准；预计截止：{new Date(active.expiresAt).toLocaleString("zh-CN")}</small>}
        </> : <p>输入金额并生成地址后，二维码和付款信息会显示在这里。</p>}
      </article>
    </section>
    <div className="finance-section-heading"><div><span className="panel-code">RECHARGE HISTORY</span><h2>充值记录</h2></div><p>状态每 10 秒自动刷新</p></div>
    <section className="finance-table-wrap"><table className="finance-table"><thead><tr><th>创建时间</th><th>充值单</th><th>金额</th><th>状态</th><th>Gas 到账</th></tr></thead><tbody>{recharges.length ? recharges.map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString("zh-CN")}</td><td>{item.id}<small>{item.paymentId ? `支付编号 ${item.paymentId}` : "未生成支付编号"}</small></td><td>{item.amount.toFixed(2)} USDT</td><td>{statusLabels[item.status]}</td><td className={item.status === "credited" ? "ga-positive" : ""}>{item.status === "credited" ? formatGa(item.gasAmount) : "—"}</td></tr>) : <tr><td colSpan={5}>暂无充值记录</td></tr>}</tbody></table></section>
  </>;
}