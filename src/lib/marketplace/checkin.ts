import { randomBytes } from "node:crypto";
import { getMarketplaceDb } from "./db";
import { roundGas } from "./currency";
import { getPlatformSettings } from "@/lib/platform-settings";

/** 打卡周期按北京时间（UTC+8）划分；中国无夏令时，固定偏移即可，与服务器时区无关。 */
export function checkinDayKey(date: Date = new Date()): string {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function previousDayKey(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

export type CheckinRewardConfig = {
  baseReward: number;
  streakIncrement: number;
  maxReward: number;
  /** 奖励到达上限所需的最少连续天数（第 capDay 天起固定为 maxReward）。 */
  capDay: number;
};

export function getCheckinRewardConfig(settings = getPlatformSettings()): CheckinRewardConfig {
  const baseReward = roundGas(Math.max(0, settings.checkinBaseReward));
  const streakIncrement = roundGas(Math.max(0, settings.checkinStreakIncrement));
  const maxReward = roundGas(Math.max(baseReward, settings.checkinMaxReward));
  const capDay = streakIncrement > 0 ? Math.max(1, Math.ceil((maxReward - baseReward) / streakIncrement) + 1) : 1;
  return { baseReward, streakIncrement, maxReward, capDay };
}

/** 连续第 streakDays 天打卡的奖励：基础 + 逐日增量，封顶于 maxReward。 */
export function checkinRewardForDay(streakDays: number, config = getCheckinRewardConfig()): number {
  if (streakDays < 1) return 0;
  return roundGas(Math.min(config.baseReward + (streakDays - 1) * config.streakIncrement, config.maxReward));
}

export type CheckinRecord = {
  id: string;
  checkinDate: string;
  streakDays: number;
  rewardAmount: number;
  createdAt: string;
};

export type CheckinLadderStep = {
  day: number;
  reward: number;
  /** 该阶梯在当前连击下的状态：done=已完成，today=今天，next=今天之后，upcoming=断签后重新开始的位置。 */
  state: "done" | "today" | "next" | "upcoming";
};

export type CheckinStatus = {
  today: string;
  checkedInToday: boolean;
  /** 今日已打卡时含今天；未打卡时为截至昨天的连击天数（中断则为 0）。 */
  currentStreak: number;
  todayReward: number;
  tomorrowReward: number;
  config: CheckinRewardConfig;
  ladder: CheckinLadderStep[];
  totalCheckins: number;
  totalEarned: number;
  recentRecords: CheckinRecord[];
};

type CheckinRow = { id: string; checkin_date: string; streak_days: number; reward_amount: number; created_at: string };

function rowToRecord(row: CheckinRow): CheckinRecord {
  return { id: row.id, checkinDate: row.checkin_date, streakDays: row.streak_days, rewardAmount: row.reward_amount, createdAt: row.created_at };
}

/** 今日打卡将落入的连击天数：昨天已打卡则顺延 +1，否则（首次或断签）重新从 1 开始。 */
function nextStreakDays(lastRow: CheckinRow | undefined, today: string): number {
  if (!lastRow) return 1;
  if (lastRow.checkin_date === today) return lastRow.streak_days;
  if (lastRow.checkin_date === previousDayKey(today)) return lastRow.streak_days + 1;
  return 1;
}

function buildLadder(currentStreak: number, checkedInToday: boolean, config: CheckinRewardConfig): CheckinLadderStep[] {
  const steps: CheckinLadderStep[] = [];
  for (let day = 1; day <= config.capDay; day += 1) {
    let state: CheckinLadderStep["state"];
    if (checkedInToday) {
      state = day <= currentStreak ? "done" : "next";
    } else if (day <= currentStreak) {
      state = "done";
    } else if (day === currentStreak + 1) {
      state = "today";
    } else {
      state = "upcoming";
    }
    steps.push({ day, reward: checkinRewardForDay(day, config), state });
  }
  return steps;
}

export function getCheckinStatus(userId: string, now: Date = new Date()): CheckinStatus {
  const db = getMarketplaceDb();
  const today = checkinDayKey(now);
  const config = getCheckinRewardConfig();
  const lastRow = db.prepare("SELECT * FROM checkin_records WHERE user_id = ? ORDER BY checkin_date DESC LIMIT 1").get(userId) as CheckinRow | undefined;
  const checkedInToday = lastRow?.checkin_date === today;
  const pendingStreak = nextStreakDays(lastRow, today);
  const currentStreak = checkedInToday ? lastRow!.streak_days : pendingStreak === 1 ? 0 : pendingStreak - 1;
  const todayReward = checkinRewardForDay(pendingStreak, config);
  const tomorrowReward = checkinRewardForDay(pendingStreak + 1, config);
  const totals = db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(reward_amount), 0) AS earned FROM checkin_records WHERE user_id = ?").get(userId) as { count: number; earned: number };
  const recentRows = db.prepare("SELECT * FROM checkin_records WHERE user_id = ? ORDER BY checkin_date DESC LIMIT 30").all(userId) as CheckinRow[];
  return {
    today,
    checkedInToday,
    currentStreak,
    todayReward,
    tomorrowReward,
    config,
    ladder: buildLadder(currentStreak, checkedInToday, config),
    totalCheckins: totals.count,
    totalEarned: roundGas(totals.earned),
    recentRecords: recentRows.map(rowToRecord),
  };
}

export type CheckinResult = { record: CheckinRecord; balance: number; streakDays: number };

/** 完成今日打卡：在同一个事务内写入打卡记录、Gas 账本并更新余额。重复打卡返回错误。 */
export function performCheckin(userId: string, now: Date = new Date()): { ok: true; result: CheckinResult } | { ok: false; error: string } {
  const db = getMarketplaceDb();
  const today = checkinDayKey(now);
  const config = getCheckinRewardConfig();
  return db.transaction(() => {
    const lastRow = db.prepare("SELECT * FROM checkin_records WHERE user_id = ? ORDER BY checkin_date DESC LIMIT 1").get(userId) as CheckinRow | undefined;
    if (lastRow?.checkin_date === today) return { ok: false as const, error: "今日已打卡，明天再来继续连击" };
    const streakDays = nextStreakDays(lastRow, today);
    const rewardAmount = checkinRewardForDay(streakDays, config);
    if (rewardAmount <= 0) return { ok: false as const, error: "打卡奖励未配置，请联系管理员" };
    const user = db.prepare("SELECT ga_balance FROM developers WHERE id = ?").get(userId) as { ga_balance: number } | undefined;
    if (!user) return { ok: false as const, error: "账户不存在" };
    const balance = roundGas(user.ga_balance + rewardAmount);
    const recordId = `ckn-${randomBytes(10).toString("hex")}`;
    const transactionId = `ga-${randomBytes(10).toString("hex")}`;
    const createdAt = now.toISOString();
    db.prepare("UPDATE developers SET ga_balance = ?, updated_at = ? WHERE id = ?").run(balance, createdAt, userId);
    db.prepare("INSERT INTO ga_transactions (id, user_id, type, amount, balance_after, reason, created_at) VALUES (?, ?, 'checkin_reward', ?, ?, ?, ?)")
      .run(transactionId, userId, rewardAmount, balance, `每日打卡 · 连续第 ${streakDays} 天`, createdAt);
    db.prepare("INSERT INTO checkin_records (id, user_id, checkin_date, streak_days, reward_amount, ga_transaction_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(recordId, userId, today, streakDays, rewardAmount, transactionId, createdAt);
    return { ok: true as const, result: { record: { id: recordId, checkinDate: today, streakDays, rewardAmount, createdAt }, balance, streakDays } };
  })();
}

export function getCheckinFinanceSummary(): { totalGranted: number; checkinCount: number; participantCount: number } {
  const row = getMarketplaceDb().prepare(`
    SELECT
      (SELECT COALESCE(SUM(amount), 0) FROM ga_transactions WHERE type = 'checkin_reward') AS total_granted,
      (SELECT COUNT(*) FROM ga_transactions WHERE type = 'checkin_reward') AS checkin_count,
      (SELECT COUNT(DISTINCT user_id) FROM checkin_records) AS participant_count
  `).get() as { total_granted: number; checkin_count: number; participant_count: number };
  return { totalGranted: roundGas(row.total_granted), checkinCount: row.checkin_count, participantCount: row.participant_count };
}
