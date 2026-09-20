import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DirectMessageThread } from "@/components/direct-message-thread";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { UserAvatar } from "@/components/user-avatar";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { getConversation, markConversationRead } from "@/lib/marketplace/messages";

type Props = { params: Promise<{ conversationId: string }> };
export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/developer/login?next=/messages");
  const { conversationId } = await params;
  const conversation = getConversation(conversationId, user.id);
  if (!conversation) notFound();
  markConversationRead(conversationId, user.id);
  return <main className="platform-shell developer-shell"><SiteNav active="developer" /><div className="platform-breadcrumb"><Link href="/messages">← 返回消息</Link><span>DIRECT MESSAGE</span></div><Link href={`/u/${conversation.participant.participantUsername}`} className="message-thread-header"><UserAvatar name={conversation.participant.participantName} src={conversation.participant.participantAvatarUrl} size={58} /><div><h1>{conversation.participant.participantName}</h1></div></Link><DirectMessageThread conversationId={conversationId} currentUserId={user.id} initialMessages={conversation.messages} /><SiteFooter notice="请勿通过消息发送交易密码、API 密钥或支付凭据。" /></main>;
}
