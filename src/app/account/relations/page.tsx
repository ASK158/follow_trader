import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { UserAvatar } from "@/components/user-avatar";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { listRelations, searchProfiles } from "@/lib/marketplace/social";

type Props = { searchParams: Promise<{ tab?: string; q?: string }> };
export const dynamic = "force-dynamic";
export const metadata = { title: "关注与粉丝 | Sigma Bot" };

export default async function AccountRelationsPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/developer/login?next=/account/relations");
  const query = await searchParams;
  const kind = query.tab === "followers" ? "followers" : "following";
  const users = query.q ? searchProfiles(query.q, user.id) : listRelations(user.id, kind);
  return <main className="platform-shell developer-shell"><SiteNav active="developer" /><div className="platform-breadcrumb"><Link href="/developer">← 返回个人中心</Link><span>RELATIONS</span></div><section className="personal-center-content"><header className="dev-form-header"><span className="panel-code">SOCIAL CONNECTIONS</span><h1>关注与粉丝</h1><p>管理你关注的用户，并通过用户名或昵称查找账号。</p><form className="profile-search" action="/account/relations"><input name="q" defaultValue={query.q} placeholder="搜索用户名或昵称" maxLength={50} /><button>搜索用户</button></form></header>{!query.q && <nav className="profile-tabs"><Link href="/account/relations" className={kind === "following" ? "active" : ""}>我的关注</Link><Link href="/account/relations?tab=followers" className={kind === "followers" ? "active" : ""}>我的粉丝</Link></nav>}{query.q && <div className="profile-search-result"><span>“{query.q}”的搜索结果</span><Link href="/account/relations">返回关注列表</Link></div>}<div className="relation-list">{users.length ? users.map((item) => <Link href={`/u/${item.username}`} key={item.id} className="relation-card"><UserAvatar name={item.name} src={item.avatarUrl} size={54} /><span><b>{item.name}</b><p>{item.bio || "暂无简介"}</p></span></Link>) : <div className="profile-empty">{query.q ? "没有找到匹配用户" : "暂无用户"}</div>}</div></section><SiteFooter notice="你可以从公开个人主页关注用户或发起消息。" /></main>;
}
