import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FollowButton } from "@/components/follow-button";
import { MarketplaceCard } from "@/components/marketplace-card";
import { MessageUserButton } from "@/components/message-user-button";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { UserAvatar } from "@/components/user-avatar";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { getCatalogProducts, getUserFavoriteProductIds, listPublicUserProducts } from "@/lib/marketplace/products";
import { getPublicProfile } from "@/lib/marketplace/social";
import { listUserObservationAccounts } from "@/lib/observation-accounts";

type Props = { params: Promise<{ username: string }>; searchParams: Promise<{ tab?: string }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = getPublicProfile((await params).username);
  return profile ? { title: `${profile.name} (@${profile.username})`, description: profile.bio || `${profile.name} 在 Sigma Bot 的个人主页` } : {};
}

export default async function PublicProfilePage({ params, searchParams }: Props) {
  const viewer = await getCurrentUser();
  const profile = getPublicProfile((await params).username, viewer);
  if (!profile) notFound();
  const tab = (await searchParams).tab;
  const activeTab = tab === "observation" || tab === "about" || (tab === "favorites" && profile.favoritesVisibility === "public") ? tab : "products";
  const products = listPublicUserProducts(profile.id);
  const observations = listUserObservationAccounts(profile.id);
  const viewerFavorites = viewer ? getUserFavoriteProductIds(viewer.id) : new Set<string>();
  const publicFavorites = profile.favoritesVisibility === "public" ? getUserFavoriteProductIds(profile.id) : new Set<string>();
  const favoriteProducts = profile.favoritesVisibility === "public" ? getCatalogProducts().filter((product) => publicFavorites.has(product.id)) : [];
  const isSelf = viewer?.id === profile.id;
  return <main className="platform-shell profile-shell">
    <SiteNav active="developer" />
    <div className="platform-breadcrumb"><Link href="/marketplace">← 返回交易工具市场</Link><span>PERSONAL PROFILE</span></div>
    <header className="profile-header">
      <UserAvatar name={profile.name} src={profile.avatarUrl} size={136} />
      <div className="profile-intro"><span className="panel-code">SIGMA MEMBER</span><h1>{profile.name}</h1><b className="profile-username">@{profile.username}</b><p>{profile.bio || "这位用户还没有填写个人简介。"}</p>{profile.location && <small>所在地：{profile.location}</small>}{profile.contact && <small>联系方式：{profile.contact}</small>}{profile.websiteUrl && <a href={profile.websiteUrl} target="_blank" rel="noreferrer">个人网站 ↗</a>}</div>
      <div className="profile-actions">{isSelf ? <Link href="/account/profile" className="profile-primary-button">编辑资料</Link> : <><FollowButton userId={profile.id} initialFollowing={profile.isFollowing} initialCount={profile.followerCount} />{profile.canMessage && <MessageUserButton userId={profile.id} />}</>}</div>
    </header>
    <section className="profile-stats" aria-label="公开统计">
      <Link href={`/u/${profile.username}/relations?tab=followers`}><b>{profile.followerCount.toLocaleString("zh-CN")}</b><span>粉丝</span></Link>
      <Link href={`/u/${profile.username}/relations?tab=following`}><b>{profile.followingCount.toLocaleString("zh-CN")}</b><span>关注</span></Link>
      <div><b>{profile.productCount}</b><span>商城作品</span></div><div><b>{profile.observationCount}</b><span>观摩账号</span></div><div><b>{profile.favoriteCount.toLocaleString("zh-CN")}</b><span>作品被收藏</span></div><div><b>{profile.viewCount.toLocaleString("zh-CN")}</b><span>内容总浏览</span></div>
    </section>
    <nav className="profile-tabs" aria-label="用户公开内容"><Link href={`/u/${profile.username}`} className={activeTab === "products" ? "active" : ""}>商城作品</Link><Link href={`/u/${profile.username}?tab=observation`} className={activeTab === "observation" ? "active" : ""}>观摩账号</Link>{profile.favoritesVisibility === "public" && <Link href={`/u/${profile.username}?tab=favorites`} className={activeTab === "favorites" ? "active" : ""}>收藏</Link>}<Link href={`/u/${profile.username}?tab=about`} className={activeTab === "about" ? "active" : ""}>关于</Link></nav>
    {activeTab === "products" && (products.length ? <section className="market-grid">{products.map((product) => <MarketplaceCard key={product.id} product={product} isFavorite={viewerFavorites.has(product.id)} />)}</section> : <section className="profile-empty">还没有已上架的商城作品</section>)}
    {activeTab === "observation" && <section className="profile-content-list">{observations.length ? observations.map((account) => <Link href={`/observation/${account.id}`} key={account.id} className="profile-content-card"><span>{account.platform} · {account.accountType}</span><b>{account.title}</b><p>{account.summary}</p><small>{account.views} 次浏览 · {account.commentCount} 条评论</small></Link>) : <div className="profile-empty">还没有公开观摩账号</div>}</section>}
    {activeTab === "favorites" && <section className="market-grid">{favoriteProducts.length ? favoriteProducts.map((product) => <MarketplaceCard key={product.id} product={product} isFavorite={viewerFavorites.has(product.id)} />) : <div className="profile-empty">公开收藏夹为空</div>}</section>}
    {activeTab === "about" && <section className="profile-about"><h2>关于 {profile.name}</h2><p>{profile.bio || "暂未填写个人简介。"}</p><dl><div><dt>用户名</dt><dd>@{profile.username}</dd></div><div><dt>加入时间</dt><dd>{new Date(profile.createdAt).toLocaleDateString("zh-CN")}</dd></div>{profile.location && <div><dt>地区</dt><dd>{profile.location}</dd></div>}</dl></section>}
    <SiteFooter notice="个人主页仅展示用户主动公开的信息、已上架商城作品和公开观摩账号。" />
  </main>;
}
