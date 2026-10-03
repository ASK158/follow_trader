import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckinPanel } from "@/components/checkin-panel";
import { SiteNav } from "@/components/site-nav";
import { getCheckinStatus } from "@/lib/marketplace/checkin";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { formatGa } from "@/lib/marketplace/currency";

export const dynamic = "force-dynamic";
export const metadata = { title: "每日打卡 | Sigma Bot" };

export default async function CheckinPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/developer/login?next=/account/checkin");
  const status = getCheckinStatus(user.id);
  return <main className="platform-shell developer-shell"><SiteNav active="developer" /><div className="platform-breadcrumb"><Link href="/developer">← 返回个人中心</Link><span>DAILY CHECK-IN</span></div><section className="personal-center-content"><header className="dev-form-header"><span className="panel-code">DAILY CHECK-IN</span><h1>每日打卡</h1><p>当前余额：<b>{formatGa(user.gaBalance)}</b>。每日打卡即可领取 Gas 奖励，连续打卡奖励逐日递增，中断后重新开始。</p></header><CheckinPanel initialStatus={status} /></section></main>;
}
