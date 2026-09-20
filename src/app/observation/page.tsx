import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { UserAvatar } from "@/components/user-avatar";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { listObservationAccounts } from "@/lib/observation-accounts";

export const metadata: Metadata = { title: "观摩空间 | Sigma Bot", description: "浏览用户公开上架的 MT4 与 MT5 只读观摩账号。" };
export const dynamic = "force-dynamic";

export default async function ObservationPage() {
  const [user, accounts] = await Promise.all([getCurrentUser(), Promise.resolve(listObservationAccounts())]);
  return (
    <main className="platform-shell observation-shell">
      <SiteNav active="observation" />
      <header className="platform-hero observation-hero">
        <div><span className="panel-code">LIVE ACCOUNT OBSERVATION</span><h1>观摩空间</h1><p>查看用户公开分享的 MT4 / MT5 只读观摩账号，了解真实运行环境、交易风格和持续表现。平台不对收益作任何承诺。</p></div>
        <div className="observation-hero-meta"><span><i />ACCOUNT ACCESS ONLINE</span><b>{accounts.length}</b><small>个公开观摩账号</small>{user && <Link href="/developer/observation/new">+ 提交观摩账号</Link>}</div>
      </header>
      <section className="observation-grid" aria-label="观摩账号列表">
        {accounts.length ? accounts.map((account) => (
          <article className="observation-card" key={account.id}>
            <header><span>{account.platform}</span><em className={account.accountType === "真实账号" ? "live" : "demo"}><i />{account.accountType}</em></header>
            <div className="card-title-row"><h2>{account.title}</h2><Link href={`/u/${account.ownerUsername}`} className="card-author-link observation-author-link" aria-label={`查看 ${account.ownerName} 的个人主页`}><UserAvatar name={account.ownerName} src={account.ownerAvatarUrl} size={30} /><b>{account.ownerName}</b></Link></div>
            <p>{account.summary}</p>
            <dl><div><dt>服务器</dt><dd>{account.serverName}</dd></div><div><dt>账号</dt><dd>{account.accountNumber}</dd></div></dl>
            <footer><small>{account.views} 次浏览 · {account.commentCount} 条评论</small><Link href={`/observation/${account.id}`}>进入观摩 →</Link></footer>
          </article>
        )) : <div className="dev-empty observation-empty"><b>暂时还没有观摩账号</b><p>登录后可在个人中心提交第一个 MT4 / MT5 观摩账号。</p><Link href={user ? "/developer/observation/new" : "/developer/login?next=/developer/observation/new"}>{user ? "提交观摩账号 →" : "登录后提交 →"}</Link></div>}
      </section>
      <SiteFooter notice="观摩信息由用户自行提交，仅用于交流与研究。请勿使用主交易密码；跟随、复制或据此交易产生的风险由使用者自行承担。" />
    </main>
  );
}