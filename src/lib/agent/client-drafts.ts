export const LEGACY_AGENT_DRAFTS_KEY = "sigma-agent-drafts-v1";

export function agentDraftsKey(userId: string): string {
  if (!userId.trim()) throw new Error("缺少草稿所属用户");
  return `${LEGACY_AGENT_DRAFTS_KEY}:${userId}`;
}

export function readUserDrafts<T>(storage: Pick<Storage, "getItem" | "removeItem">, userId: string): T[] {
  const key = agentDraftsKey(userId);
  try {
    const value = JSON.parse(storage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}

export function clearLegacyAgentDrafts(storage: Pick<Storage, "removeItem">): void {
  storage.removeItem(LEGACY_AGENT_DRAFTS_KEY);
}
