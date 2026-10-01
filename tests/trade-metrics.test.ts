import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDailyPerformanceEntries,
  deriveMonthlyReturns,
  deriveTradeStats,
  parseTradesHistory,
  scaleCurveToGrowth,
} from "../src/lib/trade-metrics";

const CSV = [
  "Time;Type;Volume;Symbol;Price;Volume;Time;Price;Commission;Swap;Profit",
  // 入金 1000，首个交易日两笔：毛利 +10（佣金 -1 → 净 +9）、毛亏 -4（净 -4.2）
  "2025.11.01 00:00:00;Balance;;;;;;;;;1000.00",
  "2025.11.02 10:00:00;Buy;0.01;XAUUSD;2000.00;0.01;2025.11.02 12:00:00;2010.00;-1.00;;10.00",
  "2025.11.03 09:00:00;Sell;0.01;XAUUSD;2010.00;0.01;2025.11.03 09:30:00;2014.00;-0.20;;-4.00",
  // 12 月追加入金 500（不计入收益），一笔净盈利 +15
  "2025.12.01 00:00:00;Balance;;;;;;;;;500.00",
  "2025.12.05 08:00:00;Buy;0.02;XAUUSD;2050.00;0.02;2025.12.05 20:00:00;2057.55;-0.10;;15.00",
  // 2026 年 1 月一笔净亏损 -5
  "2026.01.10 08:00:00;Sell;0.01;XAUUSD;2100.00;0.01;2026.01.10 09:00:00;2105.00;-0.10;;-4.90",
].join("\n");

test("parseTradesHistory 跳过 Balance 行并保留逐笔字段", () => {
  const trades = parseTradesHistory(CSV);
  assert.equal(trades.length, 4);
  assert.equal(trades[0].side, "买入");
  assert.equal(trades[0].openedAt, "2025.11.02 10:00");
  assert.equal(trades[2].commission, -0.10);
});

test("deriveTradeStats 以净盈亏判定胜负并取净盈亏极值", () => {
  const stats = deriveTradeStats(parseTradesHistory(CSV))!;
  assert.equal(stats.trades, 4);
  // 净盈亏：+9、-4.2、+14.9、-5 → 2 胜 2 负
  assert.equal(stats.profitTrades, 2);
  assert.equal(stats.lossTrades, 2);
  assert.equal(stats.winRate, 50);
  assert.equal(stats.bestTrade, 14.9);
  assert.equal(stats.worstTrade, -5);
  // 持仓时长：2h、0.5h、12h、1h → 平均 3.875 → 四舍五入 4
  assert.equal(stats.averageHoldHours, 4);
  assert.equal(deriveTradeStats([]), null);
});

test("buildDailyPerformanceEntries 剔除出入金影响", () => {
  const entries = buildDailyPerformanceEntries(CSV);
  assert.equal(entries.length, 6);
  // 净值走向：1000 → 1009 → 1004.8 → 1504.8（入金） → 1519.7 → 1514.7
  assert.equal(entries[0].balance, 1000);
  assert.equal(entries[3].balance, 1504.8);
  assert.equal(entries.at(-1)!.balance, 1514.7);
  // 复利指数只由交易净损益构成：0.9% × (-0.4163%) × 0.9902% × (-0.3290%) ≈ 1.1411%
  const rawGrowth = (entries.at(-1)!.performanceIndex - 1) * 100;
  assert.ok(Math.abs(rawGrowth - 1.1411) < 0.01, `rawGrowth=${rawGrowth}`);
});

test("scaleCurveToGrowth 将末端校准到官方累计收益率", () => {
  const entries = buildDailyPerformanceEntries(CSV);
  const curve = scaleCurveToGrowth(entries, 10);
  assert.equal(curve.length, entries.length);
  assert.equal(curve.at(-1)!.growth, 10);
  // 中途增长同比例缩放，且起始日仍为 0
  assert.equal(curve[0].growth, 0);
  assert.ok(curve[1].growth > 0 && curve[1].growth < 10);
  assert.equal(scaleCurveToGrowth([], 10).length, 0);
});

test("deriveMonthlyReturns 逐月复利且空月为 null", () => {
  const entries = buildDailyPerformanceEntries(CSV);
  const curve = scaleCurveToGrowth(entries, 10);
  const monthly = deriveMonthlyReturns(curve);
  assert.deepEqual(monthly.map((row) => row.year), [2025, 2026]);

  const [row2025, row2026] = monthly;
  assert.equal(row2025.values.filter((value) => value !== null).length, 2);
  assert.equal(row2025.values[9], null); // 2025 年 1-10 月无交易
  assert.ok(row2025.values[10] !== null); // 11 月有值
  assert.ok(row2026.values[0]! < 0); // 1 月亏损
  assert.equal(row2026.values.filter((value) => value !== null).length, 1);

  // 各月复利连乘还原为校准后的累计收益 10%
  const compounded = monthly.reduce((accumulator, row) => {
    const yearFactor = row.values.reduce<number>((acc, value) => acc * (1 + (value ?? 0) / 100), 1);
    return accumulator * yearFactor;
  }, 1);
  assert.ok(Math.abs((compounded - 1) * 100 - 10) < 0.05, `compounded=${((compounded - 1) * 100).toFixed(4)}`);
  assert.deepEqual(deriveMonthlyReturns([]), []);
});
