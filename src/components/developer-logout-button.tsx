"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeveloperLogoutButton() {
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

  return <button type="button" className="dev-logout" onClick={logout} disabled={pending}>退出登录</button>;
}
