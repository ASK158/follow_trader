import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { TutorialSubmitForm } from "@/components/tutorial-submit-form";
import { getCurrentUser, isAdmin } from "@/lib/marketplace/auth";
import { getManagedTutorial } from "@/lib/tutorials";

export const metadata: Metadata = { title: "编辑教程 | Sigma Signal" };
export const dynamic = "force-dynamic";

export default async function EditTutorialPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/developer/login?next=/admin/tutorials");
  if (!isAdmin(admin)) redirect("/developer");
  const tutorial = getManagedTutorial((await params).id);
  if (!tutorial) notFound();
  return <main className="platform-shell developer-shell"><SiteNav active="developer" /><div className="platform-breadcrumb"><Link href="/admin/tutorials">← 返回教程管理</Link><span>EDIT / {tutorial.id}</span></div><header className="dev-form-header"><span className="panel-code">EDIT CONTENT</span><h1>编辑 {tutorial.title}</h1><p>可以保存为草稿暂时下架，或发布更新后的内容。</p></header><section className="dev-form-section"><TutorialSubmitForm tutorial={tutorial} /></section></main>;
}
