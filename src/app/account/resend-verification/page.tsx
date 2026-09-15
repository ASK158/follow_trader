import Link from "next/link";
import { ResendVerificationForm } from "@/components/resend-verification-form";
import { SiteNav } from "@/components/site-nav";
export default function ResendVerificationPage() { return <main className="platform-shell developer-shell"><SiteNav active="developer" /><section className="dev-auth-section"><div className="dev-auth-card"><span className="panel-code">VERIFY EMAIL</span><h1>重新发送验证邮件</h1><ResendVerificationForm /><Link href="/developer/login">返回登录</Link></div></section></main>; }
