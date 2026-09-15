import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { verifyEmailToken } from "@/lib/marketplace/auth";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token;
  const verified = Boolean(token && verifyEmailToken(token));
  return (
    <main className="platform-shell developer-shell">
      <SiteNav active="developer" />
      <section className="dev-auth-section"><div className="dev-auth-card">
        <span className="panel-code">EMAIL VERIFICATION</span>
        <h1>{verified ? "邮箱验证成功" : "验证链接无效"}</h1>
        <p>{verified ? "账户已激活，现在可以登录、购买、评论和上架作品。" : "链接可能已过期或已经使用，请在登录页重新发起验证。"}</p>
        <Link href="/developer/login">返回登录 →</Link>
      </div></section>
    </main>
  );
}
