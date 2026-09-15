import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ObservationSubmitForm } from "@/components/observation-submit-form";
import { SiteNav } from "@/components/site-nav";
import { getCurrentUser } from "@/lib/marketplace/auth";

export const metadata: Metadata = { title: "提交观摩空间账号 | Sigma Signal", description: "提交 MT4 或 MT5 只读观摩账号及图文介绍。" };
export const dynamic = "force-dynamic";

export default async function NewObservationAccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/developer/login?next=/developer/observation/new");
  return (
    <main className="platform-shell developer-shell">
      <SiteNav active="developer" />
      <div className="platform-breadcrumb"><Link href="/developer?tab=accounts">← 返回我的观摩账号</Link><span>NEW OBSERVATION ACCOUNT</span></div>
      <header className="dev-form-header"><span className="panel-code">SUBMIT OBSERVATION</span><h1>提交观摩空间账号</h1><p>提交 MT4 / MT5 观摩账号和图文介绍。观摩密码仅用于只读登录，请勿填写可交易的主密码。</p></header>
      <section className="dev-form-section"><ObservationSubmitForm /></section>
    </main>
  );
}