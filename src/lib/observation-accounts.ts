import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret } from "@/lib/auth/totp";
import { getMarketplaceDb } from "@/lib/marketplace/db";
import { richTextPlainText, sanitizeProductDescription } from "@/lib/marketplace/rich-text";

export type ObservationPlatform = "MT4" | "MT5";
export type ObservationAccountType = "真实账号" | "模拟账号";

export type ObservationAccount = {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerUsername: string;
  ownerAvatarUrl: string | null;
  title: string;
  platform: ObservationPlatform;
  accountType: ObservationAccountType;
  accountNumber: string;
  serverName: string;
  description: string;
  summary: string;
  views: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ObservationAccountDetail = ObservationAccount & { investorPassword: string };

export type ObservationAccountInput = Pick<ObservationAccount, "title" | "platform" | "accountType" | "accountNumber" | "serverName" | "description"> & {
  investorPassword: string;
};

type ObservationRow = {
  id: string; owner_id: string; owner_name: string; owner_username: string; owner_avatar: string | null; title: string; platform: ObservationPlatform;
  account_type: ObservationAccountType; account_number: string; server_name: string; investor_password: string;
  description: string; views: number; comment_count: number; created_at: string; updated_at: string;
};

function rowToAccount(row: ObservationRow): ObservationAccount {
  const plainText = richTextPlainText(row.description);
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    ownerUsername: row.owner_username,
    ownerAvatarUrl: row.owner_avatar ? `/api/users/${row.owner_id}/avatar` : null,
    title: row.title,
    platform: row.platform,
    accountType: row.account_type,
    accountNumber: row.account_number,
    serverName: row.server_name,
    description: row.description,
    summary: plainText.length > 120 ? `${plainText.slice(0, 120)}…` : plainText,
    views: row.views,
    commentCount: row.comment_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const selectAccounts = `
  SELECT accounts.*, developers.name AS owner_name, developers.username AS owner_username, developers.avatar_filename AS owner_avatar,
    (SELECT COUNT(*) FROM observation_comments comments WHERE comments.account_id = accounts.id AND comments.is_hidden = 0) AS comment_count
  FROM observation_accounts accounts
  JOIN developers ON developers.id = accounts.owner_id
`;

export function listObservationAccounts(): ObservationAccount[] {
  return (getMarketplaceDb().prepare(`${selectAccounts} ORDER BY accounts.updated_at DESC`).all() as ObservationRow[]).map(rowToAccount);
}

export function listUserObservationAccounts(userId: string): ObservationAccount[] {
  return (getMarketplaceDb().prepare(`${selectAccounts} WHERE accounts.owner_id = ? ORDER BY accounts.updated_at DESC`).all(userId) as ObservationRow[]).map(rowToAccount);
}

export function getObservationAccount(id: string): ObservationAccountDetail | null {
  const row = getMarketplaceDb().prepare(`${selectAccounts} WHERE accounts.id = ?`).get(id) as ObservationRow | undefined;
  if (!row) return null;
  return { ...rowToAccount(row), investorPassword: decryptSecret(row.investor_password) };
}

export function createObservationAccount(ownerId: string, input: ObservationAccountInput): ObservationAccountDetail {
  const id = `observe-${randomBytes(8).toString("hex")}`;
  const now = new Date().toISOString();
  getMarketplaceDb().prepare(`
    INSERT INTO observation_accounts (id, owner_id, title, platform, account_type, account_number, server_name, investor_password, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, ownerId, input.title, input.platform, input.accountType, input.accountNumber, input.serverName, encryptSecret(input.investorPassword), input.description, now, now);
  return getObservationAccount(id)!;
}

export function incrementObservationViews(id: string): void {
  getMarketplaceDb().prepare("UPDATE observation_accounts SET views = views + 1 WHERE id = ?").run(id);
}

export function validateObservationForm(formData: FormData): { input?: ObservationAccountInput; error?: string } {
  const title = String(formData.get("title") ?? "").trim();
  const platform = formData.get("platform");
  const accountType = formData.get("accountType");
  const accountNumber = String(formData.get("accountNumber") ?? "").trim();
  const serverName = String(formData.get("serverName") ?? "").trim();
  const investorPassword = String(formData.get("investorPassword") ?? "");
  const description = sanitizeProductDescription(String(formData.get("description") ?? ""));
  if (title.length < 2 || title.length > 80) return { error: "展示名称需要 2 至 80 个字符" };
  if (platform !== "MT4" && platform !== "MT5") return { error: "请选择 MT4 或 MT5 平台" };
  if (accountType !== "真实账号" && accountType !== "模拟账号") return { error: "请选择真实账号或模拟账号" };
  if (!/^\d{3,32}$/.test(accountNumber)) return { error: "账号需要填写 3 至 32 位数字" };
  if (serverName.length < 2 || serverName.length > 120) return { error: "服务器全称需要 2 至 120 个字符" };
  if (investorPassword.length < 4 || investorPassword.length > 128) return { error: "观摩密码需要 4 至 128 个字符" };
  if (richTextPlainText(description).length < 20) return { error: "图文介绍至少需要 20 个字符" };
  return { input: { title, platform, accountType, accountNumber, serverName, investorPassword, description } };
}