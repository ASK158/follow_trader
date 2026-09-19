import Link from "next/link";
import { redirect } from "next/navigation";
import { ProfileSettings } from "@/components/profile-settings";
import { SiteNav } from "@/components/site-nav";
import { getCurrentUser } from "@/lib/marketplace/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "个人资料与隐私 | Sigma Bot" };

export default async function ProfileSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/developer/login?next=/account/profile");
  return <main className="platform-shell developer-shell"><SiteNav active="developer" /><div className="platform-breadcrumb"><Link href="/developer">← 返回个人中心</Link><span>PROFILE SETTINGS</span></div><section className="personal-center-content"><header className="dev-form-header"><span className="panel-code">PROFILE & PRIVACY</span><h1>个人资料与隐私</h1><p>管理公开身份、头像、联系方式可见范围和社交互动权限。</p></header><ProfileSettings user={user} /></section></main>;
}
