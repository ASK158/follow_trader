import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const dataDir = mkdtempSync(join(tmpdir(), "signal-checkin-test-"));
process.env.SIGNAL_DATA_DIR = dataDir;

let database: typeof import("../src/lib/marketplace/db");
let checkin: typeof import("../src/lib/marketplace/checkin");
let platformSettings: typeof import("../src/lib/platform-settings");

test.before(async () => {
  database = await import("../src/lib/marketplace/db");
  checkin = await import("../src/lib/marketplace/checkin");
  platformSettings = await import("../src/lib/platform-settings");
  const now = new Date().toISOString();
  database.getMarketplaceDb().prepare("INSERT INTO developers (id, email, password_hash, name, role, status, created_at, updated_at) VALUES ('checkin-user', 'checkin@test.local', 'x:y', 'Checkin User', 'user', 'active', ?, ?)").run(now, now);
});

test.after(() => {
  database.getMarketplaceDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});

/** 构造某个北京日期白天时刻的 Date，用于模拟连续/断签场景。 */
function at(dayKey: string, hourUtc = 6): Date {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hourUtc));
}

test("打卡周期按北京时间 UTC+8 划分", () => {
  assert.equal(checkin.checkinDayKey(new Date("2026-10-03T15:59:59Z")), "2026-10-03");
  assert.equal(checkin.checkinDayKey(new Date("2026-10-03T16:00:00Z")), "2026-10-04");
});

test("奖励公式：基础起步、逐日递增、封顶于上限", () => {
  const config = checkin.getCheckinRewardConfig();
  assert.equal(config.capDay, 10);
  assert.equal(checkin.checkinRewardForDay(1, config), 1);
  assert.equal(checkin.checkinRewardForDay(5, config), 5);
  assert.equal(checkin.checkinRewardForDay(10, config), 10);
  assert.equal(checkin.checkinRewardForDay(11, config), 10);
  assert.equal(checkin.checkinRewardForDay(30, config), 10);
});

test("首次打卡获得基础奖励并写入 Gas 账本", () => {
  const now = at("2026-10-01");
  const outcome = checkin.performCheckin("checkin-user", now);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.result.streakDays, 1);
  assert.equal(outcome.result.record.rewardAmount, 1);
  assert.equal(outcome.result.balance, 1);
  const db = database.getMarketplaceDb();
  const ledger = db.prepare("SELECT type, amount, balance_after, reason FROM ga_transactions WHERE user_id = 'checkin-user'").get() as { type: string; amount: number; balance_after: number; reason: string };
  assert.equal(ledger.type, "checkin_reward");
  assert.equal(ledger.amount, 1);
  assert.equal(ledger.balance_after, 1);
  assert.match(ledger.reason, /连续第 1 天/);
});

test("同一天重复打卡被拒绝", () => {
  const outcome = checkin.performCheckin("checkin-user", at("2026-10-01", 10));
  assert.equal(outcome.ok, false);
  assert.match(!outcome.ok ? outcome.error : "", /今日已打卡/);
});

test("连续打卡奖励递增并在断签后重置", () => {
  for (const [day, expected] of [["2026-10-02", 2], ["2026-10-03", 3], ["2026-10-04", 4]] as const) {
    const outcome = checkin.performCheckin("checkin-user", at(day));
    assert.equal(outcome.ok, true, day);
    if (outcome.ok) assert.equal(outcome.result.record.rewardAmount, expected, day);
  }
  // 跳过 10-05，10-06 打卡应重置为第 1 天的基础奖励
  const resumed = checkin.performCheckin("checkin-user", at("2026-10-06"));
  assert.equal(resumed.ok, true);
  if (resumed.ok) {
    assert.equal(resumed.result.streakDays, 1);
    assert.equal(resumed.result.record.rewardAmount, 1);
  }
});

test("连击 10 天后奖励保持上限", () => {
  for (let day = 7; day <= 15; day += 1) {
    const outcome = checkin.performCheckin("checkin-user", at(`2026-10-${String(day).padStart(2, "0")}`));
    assert.equal(outcome.ok, true, `2026-10-${day}`);
  }
  // 10-06 起连击：10-15 是连击第 10 天
  const day11 = checkin.performCheckin("checkin-user", at("2026-10-16"));
  assert.equal(day11.ok, true);
  if (day11.ok) {
    assert.equal(day11.result.streakDays, 11);
    assert.equal(day11.result.record.rewardAmount, 10);
  }
});

test("状态接口反映连击、阶梯与统计", () => {
  const status = checkin.getCheckinStatus("checkin-user", at("2026-10-16", 10));
  assert.equal(status.checkedInToday, true);
  assert.equal(status.currentStreak, 11);
  assert.equal(status.todayReward, 10);
  assert.equal(status.tomorrowReward, 10);
  assert.equal(status.totalCheckins, 15);
  assert.equal(status.totalEarned, 1 + 2 + 3 + 4 + 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 + 10);
  assert.equal(status.ladder.length, 10);
  assert.equal(status.ladder[0].state, "done");
  assert.equal(status.ladder[9].state, "done");
  const nextDay = checkin.getCheckinStatus("checkin-user", at("2026-10-17", 10));
  assert.equal(nextDay.checkedInToday, false);
  assert.equal(nextDay.currentStreak, 11);
  assert.equal(nextDay.todayReward, 10);
  assert.equal(nextDay.ladder[9].state, "done");
  assert.equal(nextDay.tomorrowReward, 10);
});

test("断签次日状态回到起点，今日格指向第 1 天", () => {
  const status = checkin.getCheckinStatus("checkin-user", at("2026-10-20", 10));
  // 最后打卡是 10-16，10-20 已断签
  assert.equal(status.checkedInToday, false);
  assert.equal(status.currentStreak, 0);
  assert.equal(status.todayReward, 1);
  assert.equal(status.ladder[0].state, "today");
  assert.equal(status.ladder[1].state, "upcoming");
});

test("管理员调整配置后按新参数计算", () => {
  platformSettings.updatePlatformSettings({ ...platformSettings.getPlatformSettings(), checkinBaseReward: 2, checkinStreakIncrement: 2, checkinMaxReward: 6 });
  const config = checkin.getCheckinRewardConfig();
  assert.equal(config.capDay, 3);
  assert.equal(checkin.checkinRewardForDay(1, config), 2);
  assert.equal(checkin.checkinRewardForDay(2, config), 4);
  assert.equal(checkin.checkinRewardForDay(3, config), 6);
  assert.equal(checkin.checkinRewardForDay(4, config), 6);
  const outcome = checkin.performCheckin("checkin-user", at("2026-10-21"));
  assert.equal(outcome.ok, true);
  if (outcome.ok) assert.equal(outcome.result.record.rewardAmount, 2);
});

test("打卡财务汇总统计发放总额与参与人数", () => {
  const summary = checkin.getCheckinFinanceSummary();
  assert.equal(summary.participantCount, 1);
  assert.equal(summary.checkinCount, 16);
  assert.ok(summary.totalGranted > 0);
});
