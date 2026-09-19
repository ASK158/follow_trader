import Link from "next/link";
import { AccountMenu } from "@/components/account-menu";
import { SiteNavMenu } from "@/components/site-nav-menu";
import { getCurrentDeveloper, isAdmin } from "@/lib/marketplace/auth";
import { listConversations } from "@/lib/marketplace/messages";

type NavSection = "signals" | "marketplace" | "favorites" | "agent" | "tutorials" | "observation" | "developer";

const items: Array<{ key: NavSection; href: string; label: string; shortLabel: string }> = [
  { key: "signals", href: "/", label: "策略信号中心", shortLabel: "信号" },
  { key: "marketplace", href: "/marketplace", label: "EA / 指标商城", shortLabel: "商城" },
  { key: "observation", href: "/observation", label: "观摩空间", shortLabel: "观摩" },
  { key: "tutorials", href: "/tutorials", label: "教程", shortLabel: "教程" },
];

export async function SiteNav({ active }: { active: NavSection }) {
  const currentUser = await getCurrentDeveloper();
  const unreadCount = currentUser ? listConversations(currentUser.id).reduce((total, conversation) => total + conversation.unreadCount, 0) : 0;
  return (
    <nav className="site-nav" aria-label="主功能导航">
      <SiteNavMenu active={active} signedIn={Boolean(currentUser)} username={currentUser?.username} />
      <Link href="/" className="site-brand" aria-label="Sigma Bot 首页">
        <span>Σ</span><b>SIGMA BOT</b>
      </Link>
      <div className="site-nav-tabs">
        {items.map((item) => (
          <Link key={item.key} href={item.href} className={active === item.key ? "active" : ""} aria-current={active === item.key ? "page" : undefined}>
            <span>{item.label}</span><small>{item.shortLabel}</small>
          </Link>
        ))}
      </div>
      <div className="site-nav-account">
        <Link href="/agent" className={`site-system-state${active === "agent" ? " active" : ""}`} aria-current={active === "agent" ? "page" : undefined}><i />AI 实验室</Link>
        {currentUser ? <>
          <AccountMenu name={currentUser.name} username={currentUser.username} avatarUrl={currentUser.avatarUrl} gaBalance={currentUser.gaBalance} isAdmin={isAdmin(currentUser)} unreadCount={unreadCount} active={active === "developer"} />
        </> : <Link href="/developer/login"><span>注册/登录</span><small>登录</small></Link>}
      </div>
    </nav>
  );
}
