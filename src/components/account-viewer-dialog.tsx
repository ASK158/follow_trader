"use client";

import { useEffect, useState } from "react";

const accountDetails = [
  ["账号", "123456"],
  ["观摩密码", "abcde"],
  ["服务器", "ICMarketsSC-MT5-Live"],
  ["联系方式", "wx2026"],
] as const;

export function AccountViewerDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <>
      <button type="button" className="viewer-button" onClick={() => setOpen(true)}>查看观摩账号</button>
      {open && <div className="dialog-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
        <section className="viewer-dialog" role="dialog" aria-modal="true" aria-labelledby="viewer-dialog-title" onMouseDown={event => event.stopPropagation()}>
          <div className="viewer-dialog-heading"><div><span className="panel-label">观摩账号</span><h2 id="viewer-dialog-title">账户登录信息</h2></div><button type="button" className="dialog-close" onClick={() => setOpen(false)} aria-label="关闭弹出框">×</button></div>
          <p>请在 MetaTrader 5 中使用以下信息登录观摩账户。</p>
          <dl className="viewer-details">{accountDetails.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <button type="button" className="dialog-confirm" onClick={() => setOpen(false)}>我知道了</button>
        </section>
      </div>}
    </>
  );
}
