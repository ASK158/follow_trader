import { randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { getMarketplaceDb } from "@/lib/marketplace/db";

type EmailTemplate = "verify_email" | "reset_password";

const templateContent: Record<EmailTemplate, { subject: string; heading: string; action: string; expires: string }> = {
  verify_email: { subject: "验证你的 Sigma Bot 账户", heading: "完成邮箱验证", action: "验证邮箱", expires: "此链接将在 24 小时后失效，且只能使用一次。" },
  reset_password: { subject: "重置你的 Sigma Bot 密码", heading: "重置账户密码", action: "设置新密码", expires: "此链接将在 30 分钟后失效，且只能使用一次。" },
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

async function sendWithSmtp(recipient: string, template: EmailTemplate, actionUrl: string): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;
  if (!host || !user || !pass || !from) return false;
  const port = Number(process.env.SMTP_PORT ?? "465");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP_PORT 配置无效");
  const content = templateContent[template];
  const safeUrl = escapeHtml(actionUrl);
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: { user, pass },
  });
  await transporter.sendMail({
    from,
    to: recipient,
    subject: content.subject,
    text: `${content.heading}\n\n请打开以下链接完成操作：\n${actionUrl}\n\n${content.expires}\n如果不是你本人操作，请忽略本邮件。`,
    html: `<div style="max-width:560px;margin:auto;padding:32px;font-family:Arial,'Microsoft YaHei',sans-serif;color:#292520"><h1 style="font-size:24px">${content.heading}</h1><p>请点击下面的按钮完成操作：</p><p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;background:#b4162b;color:#fff;text-decoration:none">${content.action}</a></p><p style="font-size:13px;color:#6b625b">${content.expires}</p><p style="font-size:12px;color:#8a8179">如果按钮无法打开，请复制此地址到浏览器：<br><a href="${safeUrl}">${safeUrl}</a></p><p style="font-size:12px;color:#8a8179">如果不是你本人操作，请忽略本邮件。</p></div>`,
  });
  return true;
}

export async function queueAccountEmail(recipient: string, template: EmailTemplate, actionUrl: string): Promise<void> {
  const db = getMarketplaceDb();
  const id = `mail-${randomBytes(10).toString("hex")}`;
  const payload = { actionUrl };
  db.prepare("INSERT INTO email_outbox (id, recipient, template, payload, created_at) VALUES (?, ?, ?, ?, ?)").run(
    id, recipient, template, JSON.stringify(payload), new Date().toISOString(),
  );
  const webhook = process.env.EMAIL_WEBHOOK_URL;
  const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM);
  if (!webhook && !smtpConfigured) {
    if (process.env.NODE_ENV !== "production") console.info(`[auth-email:${template}] ${recipient} ${actionUrl}`);
    return;
  }
  try {
    if (webhook) {
      const response = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(process.env.EMAIL_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.EMAIL_WEBHOOK_TOKEN}` } : {}) },
        body: JSON.stringify({ to: recipient, template, actionUrl }),
      });
      if (!response.ok) throw new Error(`邮件服务返回 ${response.status}`);
    } else {
      await sendWithSmtp(recipient, template, actionUrl);
    }
    db.prepare("UPDATE email_outbox SET status = 'sent', sent_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  } catch (error) {
    db.prepare("UPDATE email_outbox SET status = 'failed' WHERE id = ?").run(id);
    console.error("账户邮件发送失败", error);
  }
}
