"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type NavSection = "signals" | "marketplace" | "favorites" | "agent" | "tutorials" | "observation" | "developer";

type Props = {
  active: NavSection;
  signedIn: boolean;
};

const items: Array<{ key: NavSection; href: string; label: string }> = [
  { key: "signals", href: "/", label: "策略信号中心" },
  { key: "marketplace", href: "/marketplace", label: "EA / 指标商城" },
  { key: "observation", href: "/observation", label: "观摩空间" },
  { key: "tutorials", href: "/tutorials", label: "教程" },
  { key: "agent", href: "/agent", label: "AI 实验室" },
];

export function SiteNavMenu({ active, signedIn }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  function closeMenu() {
    setOpen(false);
  }

  return (
    <div className="site-nav-mobile-menu">
      <button
        type="button"
        className="site-nav-menu-button"
        aria-label={open ? "关闭主菜单" : "打开主菜单"}
        aria-expanded={open}
        aria-controls="site-mobile-navigation"
        onClick={() => setOpen((visible) => !visible)}
      >
        <span /><span /><span />
      </button>
      {open && <button type="button" className="site-nav-menu-backdrop" aria-label="关闭主菜单" onClick={closeMenu} />}
      <nav id="site-mobile-navigation" className="site-nav-menu-panel" aria-label="移动端主功能导航" hidden={!open}>
        {items.map((item) => (
          <Link key={item.key} href={item.href} className={active === item.key ? "active" : ""} aria-current={active === item.key ? "page" : undefined} onClick={closeMenu}>
            {item.label}
          </Link>
        ))}
        {!signedIn && <Link href="/developer/login" className={active === "developer" ? "active" : ""} aria-current={active === "developer" ? "page" : undefined} onClick={closeMenu}>注册 / 登录</Link>}
      </nav>
    </div>
  );
}