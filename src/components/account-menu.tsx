"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DeveloperLogoutButton } from "@/components/developer-logout-button";
import { UserAvatar } from "@/components/user-avatar";
import { formatGa } from "@/lib/marketplace/currency";

type Props = {
  name: string;
  username: string;
  avatarUrl: string | null;
  gaBalance: number;
  isAdmin?: boolean;
  unreadCount?: number;
  active?: boolean;
};

type MenuItem = { href: string; label: string; description?: string };
type MenuGroup = { label: string; items: MenuItem[] };

function getMenuGroups(username: string, admin: boolean): MenuGroup[] {
  const groups: MenuGroup[] = [
    {
      label: "个人账户",
      items: [
        { href: `/u/${username}`, label: "个人主页", description: "查看个人资料与作品" },
        { href: "/account/profile", label: "个人资料", description: "头像、简介与隐私" },
        { href: "/account", label: "账户与安全", description: "密码、验证与设备" },
      ],
    },
    {
      label: "内容管理",
      items: [
        { href: "/developer?tab=products", label: "商城作品" },
        { href: "/developer?tab=accounts", label: "观摩账号" },
      ],
    },
    {
      label: "互动与收藏",
      items: [
        { href: "/account/relations", label: "关注与粉丝" },
        { href: "/marketplace/favorites", label: "收藏夹" },
      ],
    },
    {
      label: "交易与服务",
      items: [
        { href: "/account/orders", label: "我的订单" },
        { href: "/account/recharge", label: "Gas 资产" },
        { href: "/account/orders?orderTab=agent", label: "AI 使用记录" },
      ],
    },
  ];
  if (admin) groups.push({ label: "管理", items: [{ href: "/admin", label: "管理员中心", description: "审核、教程、用户与财务" }] });
  return groups;
}

export function AccountMenu({ name, username, avatarUrl, gaBalance, isAdmin = false, unreadCount = 0, active = false }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuGroups = getMenuGroups(username, isAdmin);

  useEffect(() => {
    if (!open) return;
    function closeMenu(event: KeyboardEvent | PointerEvent) {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setOpen(false);
        return;
      }
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", closeMenu);
    document.addEventListener("pointerdown", closeMenu);
    return () => {
      document.removeEventListener("keydown", closeMenu);
      document.removeEventListener("pointerdown", closeMenu);
    };
  }, [open]);

  return (
    <div className={`account-menu${active ? " active" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="account-menu-trigger"
        aria-label="打开个人中心菜单"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <UserAvatar name={name} src={avatarUrl} size={34} />
        <span><b>{name}</b></span>
        <i aria-hidden="true">⌄</i>
      </button>
      <Link href="/messages" className="site-message-link" aria-label={unreadCount ? `消息，${unreadCount} 条未读` : "消息"} title="消息">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v11H8l-4 3v-14Z" /><path d="M8 9h8M8 12.5h5" /></svg>
        {unreadCount > 0 && <em>{unreadCount > 99 ? "99+" : unreadCount}</em>}
      </Link>
      {open && (
        <div className="account-menu-panel" role="menu" aria-label="个人中心目录">
          <header>
            <UserAvatar name={name} src={avatarUrl} size={46} />
            <span><b>{name}</b><small>@{username}</small></span>
            <div className="account-menu-balance"><small>Gas 余额</small><b>{formatGa(gaBalance)}</b></div>
            <Link href="/account/recharge" onClick={() => setOpen(false)}>充值</Link>
          </header>
          {menuGroups.map((group) => (
            <section key={group.label}>
              <small>{group.label}</small>
              <div>
                {group.items.map((item) => (
                  <Link key={item.href} href={item.href} role="menuitem" onClick={() => setOpen(false)}>
                    <span>{item.label}</span>
                    {item.description && <small>{item.description}</small>}
                  </Link>
                ))}
              </div>
            </section>
          ))}
          <footer><DeveloperLogoutButton className="account-menu-logout" /></footer>
        </div>
      )}
    </div>
  );
}
