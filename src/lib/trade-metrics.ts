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

export type TradeStats = {
  trades: number;
  winRate: number;
  profitTrades: number;
  lossTrades: number;
  bestTrade: number;
  worstTrade: number;
  averageHoldHours: number;
};

export type DailyPerformanceEntry = {
  date: string;
  balance: number;
  performanceIndex: number;
};

function toNumber(value: string | undefined): number {
  const parsed = Number((value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function parseCsvTimestamp(value: string): Date | null {
  const parsed = new Date(value.replace(/\./g, "-"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** 解析从已授权 MQL5 会话导出的完整 CSV；跳过余额变动等非逐笔成交记录。 */
export function parseTradesHistory(csv: string): Trade[] {
  return csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
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
    .filter((trade): trade is Trade => trade !== null);
}

/**
 * 使用导出流水中的已平仓盈亏和 Balance 变动重建每日结余。
 * MQL5 的累计收益率会剔除出入金影响，因此收益率只基于已平仓损益，
 * 余额变动仅影响资金曲线。
 */
export function buildDailyPerformanceEntries(csv: string): DailyPerformanceEntry[] {
  const dailyChanges = new Map<string, { cashFlow: number; tradeProfit: number }>();
  csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .forEach((line) => {
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

  let balance = 0;
  let performanceIndex = 1;
  return [...dailyChanges.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, changes]) => {
      // 现金流先进入账户，但不计入收益；交易损益以当日可用资金计算回报并复利。
      balance += changes.cashFlow;
      if (Math.abs(balance) > 0.000001) performanceIndex *= 1 + changes.tradeProfit / balance;
      balance += changes.tradeProfit;
      return { date, balance, performanceIndex };
    });
}

/** 将复利曲线的末端校准到 MQL5 公开页公布的累计收益率。 */
export function scaleCurveToGrowth(entries: DailyPerformanceEntry[], officialGrowth: number): CurvePoint[] {
  if (entries.length === 0) return [];
  const finalRawGrowth = (entries.at(-1)!.performanceIndex - 1) * 100;
  const growthScale = Math.abs(finalRawGrowth) > 0.000001 ? officialGrowth / finalRawGrowth : 0;
  return entries.map((point) => ({
    date: point.date,
    balance: round2(point.balance),
    growth: round2((point.performanceIndex - 1) * 100 * growthScale),
  }));
}

/**
 * 从校准后的累计收益曲线推导月度收益矩阵；无交易的月份为空。
 * 单元格与全年合计按复利衔接，因此各月连乘还原为页面展示的累计收益率。
 */
export function deriveMonthlyReturns(curve: CurvePoint[]): MonthlyReturn[] {
  if (curve.length === 0) return [];
  const monthStartGrowth = new Map<string, number>();
  const monthEndGrowth = new Map<string, number>();
  let currentMonth: string | null = null;
  for (const point of curve) {
    const month = point.date.slice(0, 7);
    if (month !== currentMonth) {
      monthStartGrowth.set(month, currentMonth === null ? 0 : monthEndGrowth.get(currentMonth) ?? 0);
      currentMonth = month;
    }
    monthEndGrowth.set(month, point.growth);
  }
  const months = [...monthEndGrowth.keys()].sort();

  const cell = (month: string): number | null => {
    const startGrowth = monthStartGrowth.get(month) ?? 0;
    if (1 + startGrowth / 100 <= 0) return null;
    const endGrowth = monthEndGrowth.get(month) ?? 0;
    return round2(((1 + endGrowth / 100) / (1 + startGrowth / 100) - 1) * 100);
  };

  const firstYear = Number(months[0].slice(0, 4));
  const lastYear = Number(months.at(-1)!.slice(0, 4));
  return Array.from({ length: lastYear - firstYear + 1 }, (_, offset) => {
    const year = firstYear + offset;
    const yearPrefix = String(year);
    const values = Array.from({ length: 12 }, (_, index) => {
      const month = `${yearPrefix}-${String(index + 1).padStart(2, "0")}`;
      return monthEndGrowth.has(month) ? cell(month) : null;
    });
    const yearMonths = months.filter((month) => month.startsWith(yearPrefix));
    const startGrowth = monthStartGrowth.get(yearMonths[0]) ?? 0;
    const endGrowth = monthEndGrowth.get(yearMonths.at(-1)!) ?? 0;
    const total = 1 + startGrowth / 100 > 0 ? ((1 + endGrowth / 100) / (1 + startGrowth / 100) - 1) * 100 : 0;
    return { year, values, total: round2(total) };
  });
}

/** 从完整平仓流水推导胜率、交易次数与盈亏极值；净盈亏（含佣金/库存费）> 0 计为盈利。 */
export function deriveTradeStats(trades: Trade[]): TradeStats | null {
  if (trades.length === 0) return null;
  let profitTrades = 0;
  let bestTrade = -Infinity;
  let worstTrade = Infinity;
  let totalHoldHours = 0;
  for (const trade of trades) {
    const netProfit = trade.profit + trade.commission + trade.swap;
    if (netProfit > 0) profitTrades += 1;
    bestTrade = Math.max(bestTrade, netProfit);
    worstTrade = Math.min(worstTrade, netProfit);
    const openedAt = parseCsvTimestamp(trade.openedAt);
    const closedAt = parseCsvTimestamp(trade.closedAt);
    if (openedAt && closedAt) totalHoldHours += (closedAt.getTime() - openedAt.getTime()) / 3_600_000;
  }
  return {
    trades: trades.length,
    profitTrades,
    lossTrades: trades.length - profitTrades,
    winRate: round2((profitTrades / trades.length) * 100),
    bestTrade: round2(bestTrade),
    worstTrade: round2(worstTrade),
    averageHoldHours: Math.round(totalHoldHours / trades.length),
  };
}
