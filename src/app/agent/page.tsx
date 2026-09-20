import { AgentWorkbench } from "@/components/agent-workbench";
import { SiteNav } from "@/components/site-nav";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/marketplace/auth";
import { getAgentBillingStatus } from "@/lib/agent/billing";

export const metadata = {
  title: "MT5 策略 Agent | Sigma Bot",
  description: "通过自然语言生成结构化 MT5 策略、MQL5 代码和策略逻辑图。",
};

export const dynamic = "force-dynamic";

export default async function AgentPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/developer/login?next=/agent");
  const billing = getAgentBillingStatus(user.id);
  return (
    <main className="agent-shell">
      <SiteNav active="agent" />
      <AgentWorkbench initialBilling={billing} userId={user.id} userName={user.name} userAvatarUrl={user.avatarUrl} />
    </main>
  );
}