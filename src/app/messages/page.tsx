import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { UserAvatar } from "@/components/user-avatar";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { listConversations } from "@/lib/marketplace/messages";

export const dynamic = "force-dynamic";
export const metadata = { title: "消息 | Sigma Bot" };

export default async function MessagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/developer/login?next=/messages");
  const conversations = listConversations(user.id);
  return <main className="platform-shell developer-shell"><SiteNav active="developer" /><div className="platform-breadcrumb"><Link href="/developer">← 返回个人中心</Link><span>MESSAGES</span></div><section className="personal-center-content"><header className="dev-form-header"><span className="panel-code">DIRECT MESSAGES</span><h1>消息</h1><p>与平台用户进行一对一沟通。新的会话从对方个人主页发起。</p></header><div className="conversation-list">{conversations.length ? conversations.map((item) => <Link href={`/messages/${item.id}`} key={item.id} className={`conversation-card${item.unreadCount ? " unread" : ""}`}><UserAvatar name={item.participantName} src={item.participantAvatarUrl} size={52} /><span><b>{item.participantName}</b><p>{item.lastMessage}</p><small>{new Date(item.updatedAt).toLocaleString("zh-CN")}</small></span>{item.unreadCount > 0 && <em>{item.unreadCount}</em>}</Link>) : <div className="profile-empty">暂无消息会话</div>}</div></section><SiteFooter notice="请勿通过消息发送交易密码、API 密钥或支付凭据。" /></main>;
}
