import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { TutorialSubmitForm } from "@/components/tutorial-submit-form";
import { getCurrentUser, isAdmin } from "@/lib/marketplace/auth";

export const metadata: Metadata = { title: "上传教程 | Sigma Signal" };
export const dynamic = "force-dynamic";

export default async function NewTutorialPage() {
  const admin = await getCurrentUser();
  if (!admin) redirect("/developer/login?next=/admin/tutorials/new");
  if (!isAdmin(admin)) redirect("/developer");
  return <main className="platform-shell developer-shell"><SiteNav active="developer" /><div className="platform-breadcrumb"><Link href="/admin/tutorials">← 返回教程管理</Link><span>NEW TUTORIAL</span></div><header className="dev-form-header"><span className="panel-code">CREATE CONTENT</span><h1>上传新教程</h1><p>图文教程使用富文本编辑器；视频教程填写第三方平台链接及卡片介绍。</p></header><section className="dev-form-section"><TutorialSubmitForm /></section></main>;
}
