import { ForgotPasswordForm } from "@/components/password-reset-form";
import { SiteNav } from "@/components/site-nav";

export default function ForgotPasswordPage() {
  return <main className="platform-shell developer-shell"><SiteNav active="developer" /><section className="dev-auth-section"><div className="dev-auth-card"><span className="panel-code">ACCOUNT RECOVERY</span><h1>找回密码</h1><p>输入注册邮箱。若账户存在，系统会发送 30 分钟有效的重置链接。</p><ForgotPasswordForm /></div></section></main>;
}
