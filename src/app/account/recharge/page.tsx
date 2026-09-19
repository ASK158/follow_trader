import Link from "next/link";
import { redirect } from "next/navigation";
import { RechargePanel } from "@/components/recharge-panel";
import { SiteNav } from "@/components/site-nav";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { formatGa } from "@/lib/marketplace/currency";
import { listUserRecharges } from "@/lib/payments/recharges";

export const dynamic = "force-dynamic";
export const metadata = { title: "充值 Gas | Sigma Bot" };

export default async function RechargePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/developer/login?next=/account/recharge");
  return <main className="platform-shell developer-shell"><SiteNav active="developer" /><div className="platform-breadcrumb"><Link href="/developer">← 返回个人中心</Link><span>GAS RECHARGE</span></div><section className="personal-center-content"><header className="dev-form-header"><span className="panel-code">USDT TOP-UP</span><h1>充值 Gas</h1><p>当前余额：<b>{formatGa(user.gaBalance)}</b>。通过 USDT-TRC20 充值，支付完成并通过通道确认后自动到账。</p></header><RechargePanel initialRecharges={listUserRecharges(user.id)} emailVerified={user.emailVerified} /></section></main>;
}