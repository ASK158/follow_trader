"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeveloperLogoutButton({ className = "dev-logout" }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await fetch("/api/developer/logout", { method: "POST" });
      router.replace("/developer/login");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return <button type="button" className={className} onClick={logout} disabled={pending}>{pending ? "正在退出…" : "退出登录"}</button>;
}
