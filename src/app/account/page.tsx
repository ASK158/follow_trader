import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountSettings } from "@/components/account-settings";
import { SiteNav } from "@/components/site-nav";
import { getCurrentUser, listUserSessions } from "@/lib/marketplace/auth";
import { formatGa } from "@/lib/marketplace/currency";

export const dynamic = "force-dynamic";
export const metadata = { title: "账户与安全 | Sigma Bot" };

export default async function AccountPage() {
  const user = await getCurrentUser(); if (!user) redirect("/developer/login?next=/account");
  const sessions = await listUserSessions(user.id);
  return <main className="platform-shell developer-shell"><SiteNav active="developer" /><div className="platform-breadcrumb"><Link href="/developer">← 返回个人中心</Link><span>ACCOUNT SECURITY</span></div><section className="personal-center-content"><header className="dev-form-header"><span className="panel-code">ACCOUNT & SECURITY</span><h1>账户与安全</h1><p>Gas 余额：<b>{formatGa(user.gaBalance)}</b>。<Link href="/account/recharge">充值 Gas →</Link> 管理密码、二次验证和登录设备。</p></header><AccountSettings user={user} sessions={sessions} /></section></main>;
}
