"use client";

import { useState } from "react";

export function ShareButton({ title, text }: { title: string; text: string }) {
  const [message, setMessage] = useState("");
  async function share() {
    const data = { title, text, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(window.location.href); setMessage("链接已复制"); window.setTimeout(() => setMessage(""), 2200); }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("分享失败，请手动复制地址");
    }
  }
  return <span className="share-control"><button type="button" className="share-button" onClick={share}>↗ 分享</button>{message && <small role="status">{message}</small>}</span>;
}
