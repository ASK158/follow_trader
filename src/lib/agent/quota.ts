import { getMarketplaceDb } from "@/lib/marketplace/db";

export function consumeAgentDailyQuota(userId: string, usageDate: string, limit: number): boolean {
  const db = getMarketplaceDb();
  return db.transaction(() => {
    db.prepare("INSERT OR IGNORE INTO agent_usage (user_id, usage_date, request_count) VALUES (?, ?, 0)").run(userId, usageDate);
    const result = db.prepare("UPDATE agent_usage SET request_count = request_count + 1 WHERE user_id = ? AND usage_date = ? AND request_count < ?").run(userId, usageDate, limit);
    return result.changes === 1;
  })();
}

export function releaseAgentDailyQuota(userId: string, usageDate: string): void {
  getMarketplaceDb().prepare("UPDATE agent_usage SET request_count = MAX(request_count - 1, 0) WHERE user_id = ? AND usage_date = ?").run(userId, usageDate);
}
