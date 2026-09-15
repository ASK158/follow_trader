import { getMarketplaceDb } from "@/lib/marketplace/db";

export type AgentAction = "chat" | "modify" | "generate";

export type PlatformSettings = {
  agentFreeUsageLimit: number;
  agentChatCost: number;
  agentModifyCost: number;
  agentGenerateCost: number;
  agentMinimumGasToStart: number;
  registrationIpDailyLimit: number;
  registrationDevice30dLimit: number;
  registrationRiskThreshold: number;
};

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  agentFreeUsageLimit: 5,
  agentChatCost: 0.1,
  agentModifyCost: 0.5,
  agentGenerateCost: 1,
  agentMinimumGasToStart: 1,
  registrationIpDailyLimit: 3,
  registrationDevice30dLimit: 2,
  registrationRiskThreshold: 50,
};

const settingKeys: Record<keyof PlatformSettings, string> = {
  agentFreeUsageLimit: "agent_free_usage_limit",
  agentChatCost: "agent_chat_cost",
  agentModifyCost: "agent_modify_cost",
  agentGenerateCost: "agent_generate_cost",
  agentMinimumGasToStart: "agent_minimum_gas_to_start",
  registrationIpDailyLimit: "registration_ip_daily_limit",
  registrationDevice30dLimit: "registration_device_30d_limit",
  registrationRiskThreshold: "registration_risk_threshold",
};

function normalizedNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function getPlatformSettings(): PlatformSettings {
  const rows = getMarketplaceDb().prepare("SELECT key, value FROM platform_settings").all() as Array<{ key: string; value: string }>;
  const values = new Map(rows.map((row) => [row.key, row.value]));
  return Object.fromEntries(
    (Object.keys(settingKeys) as Array<keyof PlatformSettings>).map((name) => [name, normalizedNumber(values.get(settingKeys[name]), DEFAULT_PLATFORM_SETTINGS[name])]),
  ) as PlatformSettings;
}

export function updatePlatformSettings(settings: PlatformSettings): PlatformSettings {
  const db = getMarketplaceDb();
  const now = new Date().toISOString();
  const update = db.prepare(`
    INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  db.transaction(() => {
    for (const name of Object.keys(settingKeys) as Array<keyof PlatformSettings>) {
      update.run(settingKeys[name], String(settings[name]), now);
    }
  })();
  return getPlatformSettings();
}

export function getAgentActionCost(action: AgentAction, settings = getPlatformSettings()): number {
  if (action === "chat") return settings.agentChatCost;
  if (action === "modify") return settings.agentModifyCost;
  return settings.agentGenerateCost;
}

export function getAgentMaximumPreauthorization(settings = getPlatformSettings()): number {
  return Math.max(settings.agentMinimumGasToStart, settings.agentChatCost, settings.agentModifyCost, settings.agentGenerateCost);
}
