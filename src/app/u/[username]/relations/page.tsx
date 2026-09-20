import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { UserAvatar } from "@/components/user-avatar";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { getPublicProfile, listRelations, mayViewRelations } from "@/lib/marketplace/social";

type Props = { params: Promise<{ username: string }>; searchParams: Promise<{ tab?: string }> };
export const dynamic = "force-dynamic";

export default async function RelationsPage({ params, searchParams }: Props) {
  const viewer = await getCurrentUser();
  const profile = getPublicProfile((await params).username, viewer);
  if (!profile) notFound();
  const kind = (await searchParams).tab === "following" ? "following" : "followers";
  const allowed = mayViewRelations(profile, viewer, kind);
  const users = allowed ? listRelations(profile.id, kind) : [];
  return <main className="platform-shell profile-shell"><SiteNav active="developer" /><div className="platform-breadcrumb"><Link href={`/u/${profile.username}`}>← 返回 {profile.name} 的主页</Link><span>RELATIONS</span></div><header className="dev-form-header"><span className="panel-code">SOCIAL CONNECTIONS</span><h1>{kind === "followers" ? "粉丝" : "关注"}</h1><p>{profile.name} 的社交关系</p></header><nav className="profile-tabs"><Link href={`/u/${profile.username}/relations?tab=followers`} className={kind === "followers" ? "active" : ""}>粉丝 {profile.followerCount}</Link><Link href={`/u/${profile.username}/relations?tab=following`} className={kind === "following" ? "active" : ""}>关注 {profile.followingCount}</Link></nav>{allowed ? <section className="relation-list">{users.length ? users.map((item) => <Link href={`/u/${item.username}`} key={item.id} className="relation-card"><UserAvatar name={item.name} src={item.avatarUrl} size={54} /><span><b>{item.name}</b><p>{item.bio || "暂无简介"}</p></span></Link>) : <div className="profile-empty">暂无用户</div>}</section> : <section className="profile-empty">该列表未公开</section>}<SiteFooter notice="关注关系按照用户设置的可见范围展示。" /></main>;
}
