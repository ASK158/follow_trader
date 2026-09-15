import { ResetPasswordForm } from "@/components/password-reset-form";
import { SiteNav } from "@/components/site-nav";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  return <main className="platform-shell developer-shell"><SiteNav active="developer" /><section className="dev-auth-section"><div className="dev-auth-card"><span className="panel-code">PASSWORD RESET</span><h1>设置新密码</h1>{token ? <ResetPasswordForm token={token} /> : <p className="dev-form-error">重置链接缺少令牌。</p>}</div></section></main>;
}
