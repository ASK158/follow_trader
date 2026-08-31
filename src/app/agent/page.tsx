import Link from "next/link";
import { AgentWorkbench } from "@/components/agent-workbench";

export const metadata = {
  title: "MT5 策略 Agent | Sigma signal",
  description: "通过自然语言生成结构化 MT5 策略、MQL5 代码和策略逻辑图。",
};

export default function AgentPage() {
  return (
    <main className="agent-shell">
      <nav className="agent-nav"><Link href="/" className="brand-lockup"><span className="brand-mark">S</span><span className="brand">Sigma signal</span></Link><Link href="/" className="agent-back">← 返回策略信号</Link></nav>
      <AgentWorkbench />
    </main>
  );
}