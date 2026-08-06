import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getSignalSnapshots, invalidateSignalCaches, type SignalData } from "./signal-data";

type StoredSignalState = Pick<SignalData, "id" | "sourceStatus" | "sourceUpdatedAt" | "growth" | "maxDrawdown" | "profit" | "equity" | "balance">;
type SyncResult = { id: string; status: "updated" | "failed"; csvUpdated: boolean; reason?: string };

const dataDirectory = process.env.SIGNAL_DATA_DIR ?? join(process.cwd(), ".signal-data");
const positionsDirectory = join(dataDirectory, "positions");
const statePath = join(dataDirectory, "signals.json");

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
      const response = await fetch(signal.sourceUrl, { cache: "no-store", headers: { "User-Agent": "Signal-Web sync service/1.0", ...(cookie ? { Cookie: cookie } : {}) } });
      const page = await response.text();
      if (!response.ok || !page.includes(signal.name)) throw new Error("无法验证 MQL5 信号公开页");
      const growth = parseNumber(page, "成长");
      const profit = parseNumber(page, "利润");
      const equity = parseNumber(page, "净值");
      const balance = parseNumber(page, "结余");
      const maxDrawdown = parseMaxDrawdown(page);
      if (growth === null || profit === null || equity === null || balance === null) {
        throw new Error("无法解析 MQL5 公开页指标");
      }

      states[signal.id] = {
        id: signal.id,
        sourceStatus: "live",
        sourceUpdatedAt: new Date().toISOString(),
        growth,
        ...(maxDrawdown === null ? {} : { maxDrawdown }),
        profit,
        equity,
        balance,
      };

      let csvUpdated = false;
      const csvResponse = await fetch(`${signal.sourceUrl}/export/positions`, { cache: "no-store", headers: { "User-Agent": "Signal-Web sync service/1.0", ...(cookie ? { Cookie: cookie } : {}) } });
      const csv = await csvResponse.text();
      if (csvResponse.ok && csv.startsWith("Time;Type;")) {
        await writeAtomically(join(positionsDirectory, `signal-${signal.id}.positions.csv`), csv);
        csvUpdated = true;
      }
      return { id: signal.id, status: "updated", csvUpdated };
    } catch (error) {
      return { id: signal.id, status: "failed", csvUpdated: false, reason: error instanceof Error ? error.message : "未知错误" };
    }
  }));
  await writeAtomically(statePath, JSON.stringify(states, null, 2));
  invalidateSignalCaches();
  return results;
}