import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signal Watch | 策略信号",
  description: "MQL5 策略信号的收益与资金曲线展示",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
