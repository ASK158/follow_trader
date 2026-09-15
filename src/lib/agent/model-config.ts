import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/auth/totp";
import { getMarketplaceDb } from "@/lib/marketplace/db";

const API_KEY_SETTING = "agent_ai_api_key_encrypted";
const ENDPOINT_SETTING = "agent_ai_chat_completions_url";
const MODEL_SETTING = "agent_ai_model";
const DEFAULT_ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-chat";

type SettingRow = { key: string; value: string };

export type AgentModelConfig = {
  apiKey: string;
  endpoint: string;
  model: string;
};

export type AdminAgentModelConfig = {
  endpoint: string;
  model: string;
  apiKeyConfigured: boolean;
  source: "admin" | "environment" | "none";
};

function settingValues(): Map<string, string> {
  const rows = getMarketplaceDb().prepare(
    "SELECT key, value FROM platform_settings WHERE key IN (?, ?, ?)",
  ).all(API_KEY_SETTING, ENDPOINT_SETTING, MODEL_SETTING) as SettingRow[];
  return new Map(rows.map((row) => [row.key, row.value]));
}

export function getAgentModelConfig(): AgentModelConfig {
  const values = settingValues();
  const encryptedApiKey = values.get(API_KEY_SETTING)?.trim();
  const apiKey = encryptedApiKey ? decryptSecret(encryptedApiKey) : process.env.AI_API_KEY?.trim();
  if (!apiKey) throw new Error("服务端尚未配置 AI API 密钥");

  return {
    apiKey,
    endpoint: values.get(ENDPOINT_SETTING)?.trim() || process.env.AI_CHAT_COMPLETIONS_URL?.trim() || DEFAULT_ENDPOINT,
    model: values.get(MODEL_SETTING)?.trim() || process.env.AI_MODEL?.trim() || DEFAULT_MODEL,
  };
}

export function getAdminAgentModelConfig(): AdminAgentModelConfig {
  const values = settingValues();
  const hasAdminKey = Boolean(values.get(API_KEY_SETTING)?.trim());
  const hasEnvironmentKey = Boolean(process.env.AI_API_KEY?.trim());
  return {
    endpoint: values.get(ENDPOINT_SETTING)?.trim() || process.env.AI_CHAT_COMPLETIONS_URL?.trim() || DEFAULT_ENDPOINT,
    model: values.get(MODEL_SETTING)?.trim() || process.env.AI_MODEL?.trim() || DEFAULT_MODEL,
    apiKeyConfigured: hasAdminKey || hasEnvironmentKey,
    source: hasAdminKey ? "admin" : hasEnvironmentKey ? "environment" : "none",
  };
}

export function updateAgentModelConfig(input: { apiKey?: string; endpoint: string; model: string }): AdminAgentModelConfig {
  const db = getMarketplaceDb();
  const now = new Date().toISOString();
  const upsert = db.prepare(`
    INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  db.transaction(() => {
    if (input.apiKey?.trim()) upsert.run(API_KEY_SETTING, encryptSecret(input.apiKey.trim()), now);
    upsert.run(ENDPOINT_SETTING, input.endpoint.trim(), now);
    upsert.run(MODEL_SETTING, input.model.trim(), now);
  })();
  return getAdminAgentModelConfig();
}
