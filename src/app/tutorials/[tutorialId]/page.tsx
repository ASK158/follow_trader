import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { sanitizeProductDescription } from "@/lib/marketplace/rich-text";
import { getPublishedTutorial } from "@/lib/tutorials";

type Props = { params: Promise<{ tutorialId: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tutorial = getPublishedTutorial((await params).tutorialId);
  return tutorial ? { title: `${tutorial.title} | Sigma Bot 教程`, description: tutorial.summary } : {};
}

export default async function TutorialDetailPage({ params }: Props) {
  const tutorial = getPublishedTutorial((await params).tutorialId);
  if (!tutorial) notFound();
  if (tutorial.kind === "video" && tutorial.externalUrl) redirect(tutorial.externalUrl);
  return (
    <main className="platform-shell tutorial-detail-shell">
      <SiteNav active="tutorials" />
      <div className="platform-breadcrumb"><Link href="/tutorials">← 返回教程中心</Link><span>{tutorial.category} / {tutorial.level}</span></div>
      <article className="tutorial-article">
        <header style={{ "--tutorial-accent": tutorial.accent } as React.CSSProperties}><span className="panel-code">{tutorial.category} · {tutorial.level} · {tutorial.duration}</span><h1>{tutorial.title}</h1><p>{tutorial.summary}</p></header>
        {tutorial.content ? <div className="article-layout managed-article-layout"><aside><b>教程信息</b><span>{tutorial.category}</span><span>{tutorial.level}</span><span>{tutorial.duration}</span></aside><div className="article-content"><section><div className="rte-content" dangerouslySetInnerHTML={{ __html: sanitizeProductDescription(tutorial.content) }} /></section></div></div> : <div className="article-layout"><aside><b>本章内容</b>{tutorial.sections?.map((section, index) => <a key={section.heading} href={`#section-${index + 1}`}>{String(index + 1).padStart(2, "0")} {section.heading}</a>)}</aside><div className="article-content">{tutorial.sections?.map((section, index) => <section id={`section-${index + 1}`} key={section.heading}><span>{String(index + 1).padStart(2, "0")}</span><h2>{section.heading}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{section.points && <ul>{section.points.map((point) => <li key={point}>{point}</li>)}</ul>}<div className="article-diagram"><i>INPUT</i><b>RULE ENGINE</b><i>RISK</i><b>EXECUTION</b></div></section>)}</div></div>}
      </article>
      <SiteFooter notice="教程内容仅用于技术学习，不构成交易建议。使用任何策略前请独立验证。" />
    </main>
  );
}
