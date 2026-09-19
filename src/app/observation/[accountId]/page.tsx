import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ObservationComments } from "@/components/observation-comments";
import { ShareButton } from "@/components/share-button";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { getCurrentUser, isAdmin } from "@/lib/marketplace/auth";
import { getObservationAccount, incrementObservationViews } from "@/lib/observation-accounts";
import { listObservationComments } from "@/lib/observation-comments";
import { sanitizeProductDescription } from "@/lib/marketplace/rich-text";

type Props = { params: Promise<{ accountId: string }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const account = getObservationAccount((await params).accountId);
  return account ? { title: `${account.title} | 观摩空间`, description: account.summary } : {};
}

export default async function ObservationDetailPage({ params }: Props) {
  const accountId = (await params).accountId;
  if (!getObservationAccount(accountId)) notFound();
  incrementObservationViews(accountId);
  const account = getObservationAccount(accountId)!;
  const [user, comments] = await Promise.all([getCurrentUser(), Promise.resolve(listObservationComments(accountId))]);
  return (
    <main className="platform-shell observation-shell">
      <SiteNav active="observation" />
      <div className="platform-breadcrumb"><Link href="/observation">← 返回观摩空间</Link><span>{account.platform} / {account.accountType}</span></div>
      <header className="observation-detail-header">
        <div><span className="panel-code">OBSERVATION ACCOUNT / {account.platform}</span><h1>{account.title}</h1><p>由 <Link href={`/u/${account.ownerUsername}`}>{account.ownerName}</Link> 提交 · 更新于 {new Date(account.updatedAt).toLocaleDateString("zh-CN")}</p><ShareButton title={account.title} text={`${account.platform} ${account.accountType}观摩账号`} /></div>
        <span className={`observation-type ${account.accountType === "真实账号" ? "live" : "demo"}`}><i />{account.accountType}</span>
      </header>
      <div className="observation-detail-grid">
        <article className="observation-description"><span className="panel-code">ACCOUNT INTRODUCTION</span><h2>账号介绍</h2><div className="rte-content" dangerouslySetInnerHTML={{ __html: sanitizeProductDescription(account.description) }} /></article>
        <aside className="observation-access-panel"><span className="panel-code">READ-ONLY ACCESS</span><h2>观摩登录信息</h2><dl><div><dt>平台</dt><dd>{account.platform}</dd></div><div><dt>账号类型</dt><dd>{account.accountType}</dd></div><div><dt>交易账号</dt><dd><code>{account.accountNumber}</code></dd></div><div><dt>服务器全称</dt><dd>{account.serverName}</dd></div><div><dt>观摩密码</dt><dd><code>{account.investorPassword}</code></dd></div></dl><p>仅限只读观摩。请勿向任何页面输入交易主密码，也不要将历史表现视为未来收益保证。</p></aside>
      </div>
      <ObservationComments accountId={account.id} comments={comments} currentUser={user ? { name: user.name } : null} isAdmin={isAdmin(user)} />
      <SiteFooter notice="账号数据和介绍由提交者提供。若无法登录，请在评论区联系提交者核对服务器与观摩密码。" />
    </main>
  );
}