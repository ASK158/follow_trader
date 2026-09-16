import Link from "next/link";
import { SiteNavMenu } from "@/components/site-nav-menu";
import { getCurrentDeveloper } from "@/lib/marketplace/auth";

type NavSection = "signals" | "marketplace" | "favorites" | "agent" | "tutorials" | "observation" | "developer";

const items: Array<{ key: NavSection; href: string; label: string; shortLabel: string }> = [
  { key: "signals", href: "/", label: "策略信号中心", shortLabel: "信号" },
  { key: "marketplace", href: "/marketplace", label: "EA / 指标商城", shortLabel: "商城" },
  { key: "agent", href: "/agent", label: "AI 实验室", shortLabel: "AI" },
  { key: "tutorials", href: "/tutorials", label: "教程", shortLabel: "教程" },
];

export async function SiteNav({ active }: { active: NavSection }) {
  const currentUser = await getCurrentDeveloper();
  return (
    <nav className="site-nav" aria-label="主功能导航">
      <SiteNavMenu active={active} signedIn={Boolean(currentUser)} />
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
        <Link href="/observation" className={`site-system-state${active === "observation" ? " active" : ""}`} aria-current={active === "observation" ? "page" : undefined}><i />观摩空间</Link>
        <Link href={currentUser ? "/developer" : "/developer/login"} className={active === "developer" ? "active" : ""} aria-current={active === "developer" ? "page" : undefined}>
          <span>{currentUser ? "个人中心" : "注册/登录"}</span><small>{currentUser ? "我的" : "登录"}</small>
        </Link>
      </div>
    </nav>
  );
}
