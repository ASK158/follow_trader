import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ProxyAgent, fetch } from "undici";
import { getSignalSnapshots, invalidateSignalCaches, type StoredSignalState } from "./signal-data";

type SyncResult = { id: string; status: "updated" | "failed"; csvUpdated: boolean; reason?: string };

const dataDirectory = process.env.SIGNAL_DATA_DIR ?? join(process.cwd(), ".signal-data");
const positionsDirectory = join(dataDirectory, "positions");
const statePath = join(dataDirectory, "signals.json");
const mql5Proxy = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
const mql5Dispatcher = mql5Proxy ? new ProxyAgent(mql5Proxy) : undefined;

function fetchMql5(url: string, headers: HeadersInit) {
  return fetch(url, {
    cache: "no-store",
    headers,
    ...(mql5Dispatcher ? { dispatcher: mql5Dispatcher } : {}),
    signal: AbortSignal.timeout(120_000),
  });
}

function parseNumber(page: string, label: string): number | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = page.match(new RegExp(`<div[^>]*class=["'][^"']*s-list-info__label[^"']*["'][^>]*>\\s*${escaped}\\s*[:：]\\s*<\\/div>\\s*<div[^>]*class=["'][^"']*s-list-info__value[^"']*["'][^>]*>\\s*([\\d\\s,.]+)`, "i"));
  if (!match) return null;
  const value = Number(match[1].replace(/\s|,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function parseMaxDrawdown(page: string): number | null {
  const match = page.match(/value\s*:\s*([\d\s,.]+)\s*,\s*name\s*:\s*['"]最大跌幅['"]/i);
  if (!match) return null;
  const value = Number(match[1].replace(/\s|,/g, ""));
  return Number.isFinite(value) ? value : null;
}

/** 平均持有时间带单位（分钟/小时/天），统一折算为小时。 */
function parseAverageHoldHours(page: string): number | null {
  const match = page.match(/s-list-info__label[^>]*>\s*平均持有时间\s*[:：]?\s*<\/div>\s*<div[^>]*class=["'][^"']*s-list-info__value[^"']*["'][^>]*>\s*([\d\s,.]+)\s*(分钟|小时|天)/i);
  if (!match) return null;
  const value = Number(match[1].replace(/\s|,/g, ""));
  if (!Number.isFinite(value)) return null;
  if (match[2] === "分钟") return Math.max(1, Math.round(value / 60));
  if (match[2] === "天") return Math.round(value * 24);
  return Math.round(value);
}

async function readStates(): Promise<Record<string, StoredSignalState>> {
  try {
    return JSON.parse(await readFile(statePath, "utf8")) as Record<string, StoredSignalState>;
  } catch {
    return {};
  }
}

async function writeAtomically(path: string, content: string): Promise<void> {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, path);
}

export async function synchronizeSignals(): Promise<SyncResult[]> {
  await mkdir(positionsDirectory, { recursive: true });
  const states = await readStates();
  const cookie = process.env.MQL5_SESSION_COOKIE;
  const results = await Promise.all(getSignalSnapshots().map(async (signal): Promise<SyncResult> => {
    try {
      const headers = { "User-Agent": "Signal-Web sync service/1.0", ...(cookie ? { Cookie: cookie } : {}) };
      const response = await fetchMql5(signal.sourceUrl, headers);
      const page = await response.text();
      if (!response.ok || !page.includes(signal.name)) throw new Error("无法验证 MQL5 信号公开页");
      const growth = parseNumber(page, "成长");
      const profit = parseNumber(page, "利润");
      const equity = parseNumber(page, "净值");
      const balance = parseNumber(page, "结余");
      const maxDrawdown = parseMaxDrawdown(page);
      const initialDeposit = parseNumber(page, "初始入金");
      const withdrawals = parseNumber(page, "出金");
      const subscribers = parseNumber(page, "订阅者");
      const weeks = parseNumber(page, "周");
      const tradeDays = parseNumber(page, "交易日");
      const averageHoldHours = parseAverageHoldHours(page);
      if (growth === null || profit === null || equity === null || balance === null) {
        throw new Error("无法解析 MQL5 公开页指标");
      }

      const synchronizedAt = new Date().toISOString();
      // 展开旧状态：明细 CSV 下载失败时保留上一次的 csvUpdatedAt，便于页面暴露明细滞后。
      const nextState: StoredSignalState = {
        ...states[signal.id],
        id: signal.id,
        sourceStatus: "live",
        sourceUpdatedAt: synchronizedAt,
        growth,
        ...(maxDrawdown === null ? {} : { maxDrawdown }),
        profit,
        equity,
        balance,
        ...(initialDeposit === null ? {} : { initialDeposit }),
        ...(withdrawals === null ? {} : { withdrawals }),
        ...(subscribers === null ? {} : { subscribers }),
        ...(weeks === null ? {} : { weeks }),
        ...(tradeDays === null ? {} : { tradeDays }),
        ...(averageHoldHours === null ? {} : { averageHoldHours }),
      };

      let csvUpdated = false;
      const csvResponse = await fetchMql5(`${signal.sourceUrl}/export/positions`, headers);
      const csv = await csvResponse.text();
      if (csvResponse.ok && csv.startsWith("Time;")) {
        await writeAtomically(join(positionsDirectory, `signal-${signal.id}.positions.csv`), csv);
        nextState.csvUpdatedAt = synchronizedAt;
        csvUpdated = true;
      }
      states[signal.id] = nextState;
      return { id: signal.id, status: "updated", csvUpdated };
    } catch (error) {
      return { id: signal.id, status: "failed", csvUpdated: false, reason: error instanceof Error ? error.message : "未知错误" };
    }
  }));
  await writeAtomically(statePath, JSON.stringify(states, null, 2));
  invalidateSignalCaches();
  return results;
}
