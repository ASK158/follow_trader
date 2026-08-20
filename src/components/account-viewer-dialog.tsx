"use client";

import { useEffect, useState } from "react";

const signalDetails = [
  ["联系人", "Peter-X"],
  ["联系方式 (Telegram)", "@peterman666"],
  ["添加备注", "获取 MT5 策略信号"],
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
      <button type="button" className="viewer-button" onClick={() => setOpen(true)}>获取策略信号</button>
      {open && <div className="dialog-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
        <section className="viewer-dialog" role="dialog" aria-modal="true" aria-labelledby="viewer-dialog-title" onMouseDown={event => event.stopPropagation()}>
          <div className="viewer-dialog-heading"><div><span className="panel-label">策略信号</span><h2 id="viewer-dialog-title">获取策略信号</h2></div><button type="button" className="dialog-close" onClick={() => setOpen(false)} aria-label="关闭弹出框">×</button></div>
          <p>请通过以下方式联系，获取 MT5 策略信号。</p>
          <dl className="viewer-details">{signalDetails.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <button type="button" className="dialog-confirm" onClick={() => setOpen(false)}>我知道了</button>
        </section>
      </div>}
    </>
  );
}
