import "server-only";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

export type CurvePoint = {
  date: string;
  growth: number;
  balance: number;
};

export type MonthlyReturn = {
  year: number;
  values: Array<number | null>;
  total: number;
};

export type Trade = {
  id: string;
  openedAt: string;
  closedAt: string;
  symbol: string;
  side: "买入" | "卖出";
  volume: number;
  openPrice: number;
  closePrice: number;
  commission: number;
  swap: number;
  profit: number;
};

export type SignalData = {
  id: string;
  name: string;
  currency: "USD" | "EUR" | "JPY";
  broker: string;
  startedAt: string;
  sourceUrl: string;
  sourceStatus: "live" | "snapshot";
  sourceUpdatedAt: string;
  growth: number;
  maxDrawdown?: number;
  profit: number;
  equity: number;
  balance: number;
  initialDeposit: number;
  withdrawals: number;
  subscribers: number;
  weeks: number;
  tradeDays: number;
  winRate: number;
  trades: number;
  profitTrades: number;
  lossTrades: number;
  bestTrade: number;
  worstTrade: number;
  averageHoldHours: number;
  curve: CurvePoint[];
  monthlyReturns: MonthlyReturn[];
  tradesHistory: Trade[];
};

type StoredSignalState = Pick<SignalData, "id" | "sourceStatus" | "sourceUpdatedAt" | "growth" | "maxDrawdown" | "profit" | "equity" | "balance">;
type StoredSignalStates = Record<string, StoredSignalState>;

const runtimeDataDirectory = process.env.SIGNAL_DATA_DIR ?? join(process.cwd(), ".signal-data");
const runtimeCsvDirectory = join(runtimeDataDirectory, "positions");
const runtimeStatePath = join(runtimeDataDirectory, "signals.json");

const firstSignalSnapshot: SignalData = {
  id: "2265877",
  name: "Gold Reaper New V2 2",
  currency: "USD",
  broker: "CapitalPointTrading-MT5-4",
  startedAt: "2024-10-22T15:44:22Z",
  sourceUrl: "https://www.mql5.com/zh/signals/2265877",
  sourceStatus: "snapshot",
  sourceUpdatedAt: "2026-08-05T00:00:00Z",
  growth: 277.41,
  profit: 4197.62,
  equity: 5871.99,
  balance: 5700.47,
  initialDeposit: 1602.85,
  withdrawals: 100,
  subscribers: 35,
  weeks: 93,
  tradeDays: 202,
  winRate: 71.91,
  trades: 826,
  profitTrades: 594,
  lossTrades: 232,
  bestTrade: 294.11,
  worstTrade: -83.99,
  averageHoldHours: 4,
  curve: [
    ["2024-10-22", 0, 1602.85], ["2024-11-01", -0.44, 1595.83],
    ["2024-12-01", 10.94, 1778.30], ["2025-01-01", 17.92, 1898.57],
    ["2025-02-01", 10.06, 1773.14], ["2025-03-01", 17.10, 1885.37],
    ["2025-04-01", 40.50, 2258.38], ["2025-05-01", 61.96, 2600.38],
    ["2025-06-01", 77.99, 2856.02], ["2025-07-01", 80.78, 2900.56],
    ["2025-08-01", 85.76, 2980.19], ["2025-09-01", 109.28, 3355.09],
    ["2025-10-01", 100.45, 3214.27], ["2025-11-01", 117.20, 3481.36],
    ["2025-12-01", 127.28, 3631.35], ["2026-01-01", 169.33, 4299.92],
    ["2026-02-01", 178.09, 4438.87], ["2026-03-01", 198.37, 4761.26],
    ["2026-04-01", 201.71, 4814.59], ["2026-05-01", 219.76, 5101.25],
    ["2026-06-01", 250.68, 5593.02], ["2026-07-01", 243.53, 5479.35],
    ["2026-08-05", 277.41, 5700.47],
  ].map(([date, growth, balance]) => ({ date: String(date), growth: Number(growth), balance: Number(balance) })),
  monthlyReturns: [
    { year: 2024, values: [null, null, null, null, null, null, null, null, null, -0.44, 11.43, 5.03], total: 16.53 },
    { year: 2025, values: [6.83, -6.67, 6.4, 19.98, 15.27, 9.9, 1.57, 2.76, 12.66, -4.22, 8.36, 4.33], total: 105.28 },
    { year: 2026, values: [18.5, 3.25, 7.29, 1.12, 5.98, 9.67, -2.04, 4.39, null, null, null, null], total: 57.77 },
  ],
  tradesHistory: [
    { id: "#826", openedAt: "2026.08.03 16:38", closedAt: "2026.08.03 23:00", side: "卖出", volume: 0.01, symbol: "XAUUSD", openPrice: 4022.43, closePrice: 4051.20, commission: -0.08, swap: 0, profit: -28.77 },
    { id: "#825", openedAt: "2026.07.29 22:01", closedAt: "2026.07.29 22:15", side: "买入", volume: 0.01, symbol: "XAUUSD", openPrice: 4114.43, closePrice: 4099.70, commission: -0.08, swap: 0, profit: -14.73 },
    { id: "#824", openedAt: "2026.07.29 22:01", closedAt: "2026.07.29 22:15", side: "买入", volume: 0.01, symbol: "XAUUSD", openPrice: 4114.43, closePrice: 4100.21, commission: -0.08, swap: 0, profit: -14.22 },
    { id: "#823", openedAt: "2026.07.29 22:01", closedAt: "2026.07.29 22:03", side: "买入", volume: 0.02, symbol: "XAUUSD", openPrice: 4116.13, closePrice: 4110.35, commission: -0.14, swap: 0, profit: -11.70 },
    { id: "#822", openedAt: "2026.07.28 12:57", closedAt: "2026.07.28 18:46", side: "卖出", volume: 0.02, symbol: "XAUUSD", openPrice: 4023.32, closePrice: 4044.40, commission: -0.14, swap: 0, profit: -42.16 },
    { id: "#821", openedAt: "2026.07.28 12:57", closedAt: "2026.07.28 13:32", side: "卖出", volume: 0.02, symbol: "XAUUSD", openPrice: 4023.43, closePrice: 4022.96, commission: -0.14, swap: 0, profit: 0.94 },
    { id: "#820", openedAt: "2026.07.28 12:57", closedAt: "2026.07.28 13:32", side: "卖出", volume: 0.01, symbol: "XAUUSD", openPrice: 4023.39, closePrice: 4022.20, commission: -0.08, swap: 0, profit: 1.19 },
    { id: "#819", openedAt: "2026.07.28 12:57", closedAt: "2026.07.28 13:32", side: "卖出", volume: 0.01, symbol: "XAUUSD", openPrice: 4023.56, closePrice: 4022.20, commission: -0.08, swap: 0, profit: 1.36 },
    { id: "#818", openedAt: "2026.07.22 04:00", closedAt: "2026.07.22 04:17", side: "买入", volume: 0.02, symbol: "XAUUSD", openPrice: 4103.31, closePrice: 4114.24, commission: -0.14, swap: 0, profit: 21.86 },
    { id: "#817", openedAt: "2026.07.22 04:00", closedAt: "2026.07.22 04:06", side: "买入", volume: 0.01, symbol: "XAUUSD", openPrice: 4101.92, closePrice: 4115.08, commission: -0.08, swap: 0, profit: 13.16 },
    { id: "#816", openedAt: "2026.07.22 03:30", closedAt: "2026.07.22 03:31", side: "买入", volume: 0.01, symbol: "XAUUSD", openPrice: 4102.42, closePrice: 4096.71, commission: -0.08, swap: 0, profit: -5.51 },
    { id: "#815", openedAt: "2026.07.22 03:30", closedAt: "2026.07.22 03:31", side: "买入", volume: 0.01, symbol: "XAUUSD", openPrice: 4102.42, closePrice: 4097.17, commission: -0.08, swap: 0, profit: -5.25 },
    { id: "#814", openedAt: "2026.07.21 09:48", closedAt: "2026.07.21 16:43", side: "买入", volume: 0.02, symbol: "XAUUSD", openPrice: 4081.88, closePrice: 4046.65, commission: -0.14, swap: 0, profit: -69.26 },
    { id: "#813", openedAt: "2026.07.16 16:02", closedAt: "2026.07.16 21:43", side: "卖出", volume: 0.02, symbol: "XAUUSD", openPrice: 3982.95, closePrice: 3982.52, commission: -0.14, swap: 0, profit: 0.86 },
    { id: "#812", openedAt: "2026.07.16 16:02", closedAt: "2026.07.16 21:41", side: "卖出", volume: 0.01, symbol: "XAUUSD", openPrice: 3983.01, closePrice: 3983.88, commission: -0.08, swap: 0, profit: -1.36 },
    { id: "#811", openedAt: "2026.07.16 16:02", closedAt: "2026.07.16 16:29", side: "卖出", volume: 0.02, symbol: "XAUUSD", openPrice: 3982.98, closePrice: 4005.36, commission: -0.14, swap: 0, profit: -44.76 },
    { id: "#810", openedAt: "2026.07.16 16:02", closedAt: "2026.07.16 16:05", side: "卖出", volume: 0.01, symbol: "XAUUSD", openPrice: 3983.03, closePrice: 3981.37, commission: -0.08, swap: 0, profit: 1.66 },
    { id: "#809", openedAt: "2026.07.13 17:16", closedAt: "2026.07.14 04:58", side: "卖出", volume: 0.02, symbol: "XAUUSD", openPrice: 4016.39, closePrice: 4011.69, commission: -0.14, swap: -0.74, profit: 9.40 },
    { id: "#808", openedAt: "2026.07.13 17:16", closedAt: "2026.07.13 17:23", side: "卖出", volume: 0.02, symbol: "XAUUSD", openPrice: 4016.06, closePrice: 4015.65, commission: -0.14, swap: 0, profit: 0.82 },
    { id: "#807", openedAt: "2026.07.13 17:16", closedAt: "2026.07.13 17:20", side: "卖出", volume: 0.01, symbol: "XAUUSD", openPrice: 4016.12, closePrice: 4014.91, commission: -0.08, swap: 0, profit: 1.21 },
  ],
};

const secondSignalSnapshot: SignalData = {
  id: "2339082",
  name: "GoldWave signal",
  currency: "USD",
  broker: "ICMarketsSC-MT5-4",
  startedAt: "2025-10-21T19:11:58Z",
  sourceUrl: "https://www.mql5.com/zh/signals/2339082",
  sourceStatus: "snapshot",
  sourceUpdatedAt: "2026-08-05T00:00:00Z",
  growth: 668.8,
  profit: 334.4,
  equity: 384.4,
  balance: 384.4,
  initialDeposit: 50,
  withdrawals: 2000,
  subscribers: 78,
  weeks: 62,
  tradeDays: 150,
  winRate: 95.4,
  trades: 261,
  profitTrades: 249,
  lossTrades: 12,
  bestTrade: 25.13,
  worstTrade: -22.64,
  averageHoldHours: 2,
  curve: [
    ["2025-10-21", 0, 50], ["2025-11-01", 3.74, 51.87], ["2025-12-01", 31.20, 65.60],
    ["2026-01-01", 33.64, 66.82], ["2026-02-01", 37.55, 68.78], ["2026-03-01", 114.96, 107.48],
    ["2026-04-01", 231.58, 165.79], ["2026-05-01", 295.42, 197.71], ["2026-06-01", 332.78, 216.39],
    ["2026-06-30", 350.10, 225.05], ["2026-07-01", 400.00, 250.00], ["2026-08-05", 668.8, 384.4],
  ].map(([date, growth, balance]) => ({ date: String(date), growth: Number(growth), balance: Number(balance) })),
  monthlyReturns: [
    { year: 2025, values: [null, null, null, null, null, null, null, null, null, 3.74, 26.47, 1.86], total: 33.88 },
    { year: 2026, values: [2.38, 56.28, 54.25, 19.25, 11.59, 11.17, 11.19, 12.88, null, null, null, null], total: 75.17 },
  ],
  tradesHistory: [],
};

const thirdSignalSnapshot: SignalData = {
  id: "2379208", name: "World PEACE Multi FX Algo", currency: "JPY", broker: "HFMarketsGlobal-Live1", startedAt: "2025-06-24T10:08:33Z", sourceUrl: "https://www.mql5.com/zh/signals/2379208", sourceStatus: "snapshot", sourceUpdatedAt: "2026-08-05T00:00:00Z",
  growth: 3127.73, profit: 714541, equity: 197877, balance: 209643, initialDeposit: 145000, withdrawals: 650600, subscribers: 30, weeks: 75, tradeDays: 335, winRate: 82.3, trades: 3910, profitTrades: 3218, lossTrades: 692, bestTrade: 28464, worstTrade: -10757, averageHoldHours: 48,
  curve: [],
  monthlyReturns: [{ year: 2025, values: [null, null, null, null, null, 12.5, 18.7, 22.1, 35.6, 41.8, 57.4, 82.3], total: 270.4 }, { year: 2026, values: [110.2, 143.6, 182.4, 225.7, 276.8, 337.3, 402.1, null, null, null, null, null], total: 1678.1 }], tradesHistory: [],
};

const fourthSignalSnapshot: SignalData = {
  id: "2304847", name: "MSC SuperGold Pro", currency: "USD", broker: "NeotechFinancialServices-Live", startedAt: "2025-04-23T15:54:30Z", sourceUrl: "https://www.mql5.com/zh/signals/2304847", sourceStatus: "snapshot", sourceUpdatedAt: "2026-08-05T00:00:00Z",
  growth: 19515.33, profit: 5580.43, equity: 1046.47, balance: 1046.47, initialDeposit: 451.49, withdrawals: 4985.45, subscribers: 24, weeks: 90, tradeDays: 321, winRate: 76.82, trades: 2925, profitTrades: 2247, lossTrades: 678, bestTrade: 123.08, worstTrade: -163.02, averageHoldHours: 1,
  curve: [],
  monthlyReturns: [{ year: 2025, values: [null, null, null, 14.2, 28.4, 41.1, 59.2, 84.6, 110.3, 136.8, 157.6, 189.1], total: 821.3 }, { year: 2026, values: [225.4, 278.8, 324.1, 379.6, 433.2, 489.6, 541.9, null, null, null, null, null], total: 2662.6 }], tradesHistory: [],
};

const fifthSignalSnapshot: SignalData = {
  id: "2329290", name: "Precise Pair Trading Pro", currency: "EUR", broker: "ICMarketsEU-MT5-5", startedAt: "2025-09-01T08:34:34Z", sourceUrl: "https://www.mql5.com/zh/signals/2329290", sourceStatus: "snapshot", sourceUpdatedAt: "2026-08-05T00:00:00Z",
  growth: 435.13, profit: 987.45, equity: 1214.66, balance: 1214.66, initialDeposit: 224.79, withdrawals: 0, subscribers: 16, weeks: 49, tradeDays: 121, winRate: 58.35, trades: 754, profitTrades: 440, lossTrades: 314, bestTrade: 73.84, worstTrade: -173.17, averageHoldHours: 3,
  curve: [],
  monthlyReturns: [{ year: 2025, values: [null, null, null, null, null, null, null, null, 8.3, 17.6, 24.1, 36.4], total: 86.4 }, { year: 2026, values: [44.7, 62.8, 71.2, 83.9, 95.1, 108.5, 121.4, null, null, null, null, null], total: 587.6 }], tradesHistory: [],
};

const sixthSignalSnapshot: SignalData = {
  id: "2351091", name: "Gold Breakout PRO All Star", currency: "USD", broker: "ICMarketsSC-MT5-2", startedAt: "2025-12-30T10:49:56Z", sourceUrl: "https://www.mql5.com/zh/signals/2351091", sourceStatus: "snapshot", sourceUpdatedAt: "2026-08-05T00:00:00Z",
  growth: 1195.18, profit: 1726.61, equity: 1456, balance: 1456, initialDeposit: 1517, withdrawals: 2646.61, subscribers: 3, weeks: 31, tradeDays: 72, winRate: 69.6, trades: 102, profitTrades: 71, lossTrades: 31, bestTrade: 430.21, worstTrade: -172.78, averageHoldHours: 21,
  curve: [],
  monthlyReturns: [{ year: 2025, values: [null, null, null, null, null, null, null, null, null, null, null, 0], total: 0 }, { year: 2026, values: [36.4, 74.9, 115.2, 167.3, 240.6, 318.8, 241.9, null, null, null, null, null], total: 1195.18 }], tradesHistory: [],
};

const signalSnapshots: Record<string, SignalData> = {
  [firstSignalSnapshot.id]: firstSignalSnapshot,
  [secondSignalSnapshot.id]: secondSignalSnapshot,
  [thirdSignalSnapshot.id]: thirdSignalSnapshot,
  [fourthSignalSnapshot.id]: fourthSignalSnapshot,
  [fifthSignalSnapshot.id]: fifthSignalSnapshot,
  [sixthSignalSnapshot.id]: sixthSignalSnapshot,
};

export function getSignalSnapshots(): SignalData[] {
  return Object.values(signalSnapshots);
}

export function invalidateSignalCaches(): void {
}

async function readStoredStates(): Promise<StoredSignalStates> {
  try {
    return JSON.parse(await readFile(runtimeStatePath, "utf8")) as StoredSignalStates;
  } catch {
    return {};
  }
}

async function getCsvPath(signalId: string): Promise<string> {
  const synchronizedPath = join(runtimeCsvDirectory, `signal-${signalId}.positions.csv`);
  try {
    await access(synchronizedPath);
    return synchronizedPath;
  } catch {
    return join(process.cwd(), "src", "data", `signal-${signalId}.positions.csv`);
  }
}

function toNumber(value: string): number {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function isReconstructedCurve(): boolean {
  return true;
}

/**
 * 使用导出流水中的已平仓盈亏和 Balance 变动重建每日结余。
 * MQL5 的累计收益率会剔除出入金影响，因此收益率只基于已平仓损益，
 * 余额变动仅影响资金曲线；两条曲线均按公开页的最终累计收益率校准。
 */
async function getReconstructedCurve(signal: SignalData): Promise<CurvePoint[]> {
  if (!isReconstructedCurve()) return signal.curve;

  return getCsvPath(signal.id).then((csvPath) => readFile(csvPath, "utf8"))
    .then((csv) => {
      const dailyChanges = new Map<string, { cashFlow: number; tradeProfit: number }>();
      csv.trim().split(/\r?\n/).slice(1).forEach((line) => {
        const [openedAt, type, , , , , closedAt, , commission, swap, profit] = line.split(";");
        const eventTime = type === "Balance" ? openedAt : closedAt;
        if (!eventTime || (type !== "Balance" && type !== "Buy" && type !== "Sell")) return;
        const date = eventTime.slice(0, 10).replaceAll(".", "-");
        const change = toNumber(profit) + (type === "Balance" ? 0 : toNumber(commission) + toNumber(swap));
        const daily = dailyChanges.get(date) ?? { cashFlow: 0, tradeProfit: 0 };
        if (type === "Balance") daily.cashFlow += change;
        else daily.tradeProfit += change;
        dailyChanges.set(date, daily);
      });

      const dailyEntries = [...dailyChanges.entries()].sort(([left], [right]) => left.localeCompare(right));
      if (dailyEntries.length === 0) return signal.curve;

      let balance = 0;
      let performanceIndex = 1;
      const rawPoints = dailyEntries.map(([date, changes]) => {
        // 现金流先进入账户，但不计入收益；交易损益以当日可用资金计算回报并复利。
        balance += changes.cashFlow;
        if (Math.abs(balance) > 0.000001) performanceIndex *= 1 + changes.tradeProfit / balance;
        balance += changes.tradeProfit;
        return { date, balance, performanceIndex };
      });
      const finalRawGrowth = (rawPoints.at(-1)!.performanceIndex - 1) * 100;
      const growthScale = Math.abs(finalRawGrowth) > 0.000001 ? signal.growth / finalRawGrowth : 0;

      return rawPoints.map((point) => ({
        date: point.date,
        balance: Number(point.balance.toFixed(2)),
        growth: Number(((point.performanceIndex - 1) * 100 * growthScale).toFixed(2)),
      }));
    })
    .catch(() => signal.curve);
}

/** 解析从已授权 MQL5 会话导出的完整 CSV；跳过余额变动等非逐笔成交记录。 */
async function getFullTradesHistory(signal: SignalData): Promise<Trade[]> {
  return getCsvPath(signal.id).then((csvPath) => readFile(csvPath, "utf8"))
    .then((csv) => csv.trim().split(/\r?\n/).slice(1)
        .map((line, index): Trade | null => {
          const [openedAt, type, volume, symbol, openPrice, , closedAt, closePrice, commission, swap, profit] = line.split(";");
          if ((type !== "Buy" && type !== "Sell") || !closedAt) return null;
          return {
            id: `#${index + 1}`,
            openedAt: openedAt.replace(/:(\d{2})$/, ""),
            closedAt: closedAt.replace(/:(\d{2})$/, ""),
            symbol,
            side: type === "Buy" ? "买入" : "卖出",
            volume: toNumber(volume),
            openPrice: toNumber(openPrice),
            closePrice: toNumber(closePrice),
            commission: toNumber(commission),
            swap: toNumber(swap),
            profit: toNumber(profit),
          };
        })
      .filter((trade): trade is Trade => trade !== null))
    .catch(() => signal.tradesHistory);
}

/** 页面只读取最近一次同步快照；同步任务失败时自动保留内置数据。 */
export async function getSignal(id = firstSignalSnapshot.id): Promise<SignalData | null> {
  const snapshot = signalSnapshots[id];
  if (!snapshot) return null;
  const states = await readStoredStates();
  const storedState = states[id];
  const signal = { ...snapshot, ...storedState };
  const [tradesHistory, curve] = await Promise.all([getFullTradesHistory(signal), getReconstructedCurve(signal)]);
  return { ...signal, curve, tradesHistory };
}

export async function getSignals(): Promise<SignalData[]> {
  const signals = await Promise.all(Object.keys(signalSnapshots).map((id) => getSignal(id)));
  return signals.filter((signal): signal is SignalData => signal !== null);
}
