import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DeveloperAuthForm } from "@/components/developer-auth-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { getCurrentDeveloper } from "@/lib/marketplace/auth";

export const metadata: Metadata = { title: "用户登录 | Sigma Bot", description: "登录或注册账户，上架交易工具并参与商品评论。" };

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ next?: string }> };

export default async function DeveloperLoginPage({ searchParams }: Props) {
  const developer = await getCurrentDeveloper();
  const requestedPath = (await searchParams).next;
  const nextPath = requestedPath?.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : "/developer";
  if (developer) redirect(nextPath);
  return (
    <main className="platform-shell developer-shell">
      <SiteNav active="developer" />
      <header className="platform-hero">
        <div><span className="panel-code">USER ACCESS</span><h1>用户登录</h1><p>登录或注册统一账户，即可发表评论、收藏商品，并提交你的 MT4 / MT5 EA、指标或其他工具。作品审核通过后将在商城上架。</p></div>
      </header>
      <section className="dev-auth-section"><DeveloperAuthForm nextPath={nextPath} /></section>
      <SiteFooter notice="上架即表示你确认拥有所提交源码的完整权利；平台保留对违规作品下架的权利。" />
    </main>
  );
}
