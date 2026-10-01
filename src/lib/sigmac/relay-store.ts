export type SigmacSide = "BUY" | "SELL";

export type SigmacPosition = {
  source_id: string;
  symbol: string;
  side: SigmacSide;
  volume: number;
  sl: number;
  tp: number;
  price_open: number;
  opened_at_unix_ms: number;
  /** 发布器换算的真实 UTC 开仓时间；0 表示发布器未能判断源服务器时区。 */
  opened_at_utc_ms: number;
  source_magic: number;
};

export type SigmacAccountMetrics = {
  login: number;
  server: string;
  currency: string;
  leverage: number;
  balance: number;
  equity: number;
  margin: number;
  margin_free: number;
  floating_profit: number;
};

export type SigmacSnapshotInput = {
  schema: unknown;
  snapshot_complete: unknown;
  sequence: unknown;
  source_account: unknown;
  generated_at_unix_ms: unknown;
  expires_at_unix_ms: unknown;
  position_count: unknown;
  positions: unknown;
  account?: unknown;
  title?: unknown;
};

export type PublicLiveSignal = {
  id: string;
  title: string;
  status: "live" | "stale";
  sequence: number;
  generatedAt: string;
  receivedAt: string;
  positionCount: number;
  server: string | null;
  currency: string | null;
  account: { balance: number; equity: number; floatingProfit: number; marginFree: number; leverage: number } | null;
  positions: SigmacPosition[];
};

type StoredEntry = {
  login: number;
  sequence: number;
  generatedAtMs: number;
  expiresAtMs: number;
  receivedAtMs: number;
  title: string | null;
  server: string | null;
  currency: string | null;
  account: SigmacAccountMetrics | null;
  positions: SigmacPosition[];
};

export const SNAPSHOT_SCHEMA = "sigmac-snapshot/v1";
/** 单份快照允许的最大有效期（毫秒），与发布器 snapshot_ttl_seconds 的量级对齐。 */
const MAX_SNAPSHOT_TTL_MS = 60_000;
/** 超过该时长未收到新快照或心跳，信号在页面上标记为 stale。 */
const DEFAULT_STALE_MS = 20_000;
/** 超过该时长未更新的信号源直接从内存清理，防止无界增长。 */
const PRUNE_AFTER_MS = 24 * 60 * 60 * 1_000;

const storeHolder = globalThis as { __sigmacRelayStore?: Map<number, StoredEntry> };
const entries: Map<number, StoredEntry> = storeHolder.__sigmacRelayStore ?? new Map();
storeHolder.__sigmacRelayStore = entries;

export function staleWindowMs(): number {
  const seconds = Number(process.env.SIGMAC_STALE_SECONDS ?? "");
  return Number.isFinite(seconds) && seconds >= 5 && seconds <= 600 ? seconds * 1_000 : DEFAULT_STALE_MS;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateAccount(account: unknown, sourceAccount: number): { ok: true; account: SigmacAccountMetrics } | { ok: false; error: string } {
  if (typeof account !== "object" || account === null || Array.isArray(account)) {
    return { ok: false, error: "account 字段格式无效" };
  }
  const raw = account as Record<string, unknown>;
  if (raw.login !== sourceAccount) {
    return { ok: false, error: "account.login 与 source_account 不一致" };
  }
  if (typeof raw.server !== "string" || raw.server.length === 0 || raw.server.length > 64) {
    return { ok: false, error: "account.server 无效" };
  }
  if (typeof raw.currency !== "string" || raw.currency.length === 0 || raw.currency.length > 8) {
    return { ok: false, error: "account.currency 无效" };
  }
  const numericFields: Array<[string, number]> = [
    ["leverage", 1], ["balance", 0], ["equity", 0], ["margin", 0], ["margin_free", 0], ["floating_profit", -1e12],
  ];
  const numeric: Record<string, number> = {};
  for (const [field, minimum] of numericFields) {
    const value = raw[field];
    if (!isFiniteNumber(value) || value < minimum || value > 1e12) {
      return { ok: false, error: `account.${field} 数值无效` };
    }
    numeric[field] = value;
  }
  const metrics: SigmacAccountMetrics = {
    login: sourceAccount,
    server: raw.server,
    currency: raw.currency,
    leverage: numeric.leverage,
    balance: numeric.balance,
    equity: numeric.equity,
    margin: numeric.margin,
    margin_free: numeric.margin_free,
    floating_profit: numeric.floating_profit,
  };
  return { ok: true, account: metrics };
}

/** 校验并写入一份快照；校验规则与跟单 EA 的快照安全协议保持一致。 */
export function ingestSnapshot(raw: unknown, nowMs: number): { ok: true; login: number } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "快照必须是 JSON 对象" };
  }
  const snapshot = raw as SigmacSnapshotInput;
  if (snapshot.schema !== SNAPSHOT_SCHEMA) {
    return { ok: false, error: "schema 缺失或版本不匹配" };
  }
  if (snapshot.snapshot_complete !== true) {
    return { ok: false, error: "snapshot_complete 不是 true" };
  }
  if (!isInteger(snapshot.sequence) || snapshot.sequence <= 0) {
    return { ok: false, error: "sequence 缺失或无效" };
  }
  if (!isInteger(snapshot.source_account) || snapshot.source_account <= 0) {
    return { ok: false, error: "source_account 缺失或无效" };
  }
  if (!isInteger(snapshot.generated_at_unix_ms) || snapshot.generated_at_unix_ms <= 0) {
    return { ok: false, error: "generated_at_unix_ms 无效" };
  }
  if (!isInteger(snapshot.expires_at_unix_ms) || snapshot.expires_at_unix_ms <= snapshot.generated_at_unix_ms) {
    return { ok: false, error: "expires_at_unix_ms 无效" };
  }
  if (snapshot.expires_at_unix_ms - snapshot.generated_at_unix_ms > MAX_SNAPSHOT_TTL_MS) {
    return { ok: false, error: "快照有效期异常长" };
  }
  if (!isInteger(snapshot.position_count) || snapshot.position_count < 0) {
    return { ok: false, error: "position_count 缺失或无效" };
  }
  if (!Array.isArray(snapshot.positions)) {
    return { ok: false, error: "positions 数组缺失或格式无效" };
  }
  if (snapshot.position_count !== snapshot.positions.length) {
    return { ok: false, error: "position_count 与 positions 数量不一致" };
  }

  const positions: SigmacPosition[] = [];
  const seenIds = new Set<string>();
  for (const item of snapshot.positions) {
    if (typeof item !== "object" || item === null) {
      return { ok: false, error: "positions 中存在无效持仓" };
    }
    const position = item as Record<string, unknown>;
    if (typeof position.source_id !== "string" || position.source_id.length === 0 || position.source_id.length > 64) {
      return { ok: false, error: "positions 中存在无效 source_id" };
    }
    if (seenIds.has(position.source_id)) {
      return { ok: false, error: "positions 中存在重复 source_id" };
    }
    seenIds.add(position.source_id);
    if (typeof position.symbol !== "string" || position.symbol.length === 0 || position.symbol.length > 32) {
      return { ok: false, error: "positions 中存在无效 symbol" };
    }
    if (position.side !== "BUY" && position.side !== "SELL") {
      return { ok: false, error: "positions 中存在无效 side" };
    }
    if (!isFiniteNumber(position.volume) || position.volume <= 0 || position.volume > 1e6) {
      return { ok: false, error: "positions 中存在无效 volume" };
    }
    for (const key of ["sl", "tp"] as const) {
      const value = position[key];
      if (!isFiniteNumber(value) || value < 0 || value > 1e12) {
        return { ok: false, error: "positions 中存在无效 SL/TP" };
      }
    }
    if (!isFiniteNumber(position.price_open) || position.price_open <= 0 || position.price_open > 1e12) {
      return { ok: false, error: "positions 中存在无效 price_open" };
    }
    if (!isInteger(position.opened_at_unix_ms) || position.opened_at_unix_ms < 0) {
      return { ok: false, error: "positions 中存在无效 opened_at_unix_ms" };
    }
    let openedAtUtcMs = 0;
    if (position.opened_at_utc_ms !== undefined && position.opened_at_utc_ms !== null) {
      if (!isInteger(position.opened_at_utc_ms) || position.opened_at_utc_ms < 0) {
        return { ok: false, error: "positions 中存在无效 opened_at_utc_ms" };
      }
      openedAtUtcMs = position.opened_at_utc_ms;
    }
    positions.push({
      source_id: position.source_id,
      symbol: position.symbol,
      side: position.side,
      volume: position.volume,
      sl: position.sl as number,
      tp: position.tp as number,
      price_open: position.price_open,
      opened_at_unix_ms: position.opened_at_unix_ms,
      opened_at_utc_ms: openedAtUtcMs,
      source_magic: isInteger(position.source_magic) ? position.source_magic : 0,
    });
  }

  let title: string | null = null;
  if (snapshot.title !== undefined && snapshot.title !== null) {
    if (typeof snapshot.title !== "string" || snapshot.title.length === 0 || snapshot.title.length > 80) {
      return { ok: false, error: "title 无效" };
    }
    title = snapshot.title;
  }

  let account: SigmacAccountMetrics | null = null;
  if (snapshot.account !== undefined && snapshot.account !== null) {
    const result = validateAccount(snapshot.account, snapshot.source_account);
    if (!result.ok) return result;
    account = result.account;
  }

  const existing = entries.get(snapshot.source_account);
  if (existing && snapshot.sequence < existing.sequence) {
    return { ok: false, error: "sequence 比已接收快照更旧" };
  }

  entries.set(snapshot.source_account, {
    login: snapshot.source_account,
    sequence: snapshot.sequence,
    generatedAtMs: snapshot.generated_at_unix_ms,
    expiresAtMs: snapshot.expires_at_unix_ms,
    receivedAtMs: nowMs,
    title,
    server: account?.server ?? null,
    currency: account?.currency ?? null,
    account,
    positions,
  });
  return { ok: true, login: snapshot.source_account };
}

/** 账号脱敏：保留首尾各两位，中间以 *** 代替。 */
export function maskLogin(login: number): string {
  const text = String(login);
  if (text.length <= 4) return "***";
  return `${text.slice(0, 2)}***${text.slice(-2)}`;
}

function toPublic(entry: StoredEntry, nowMs: number): PublicLiveSignal {
  return {
    id: maskLogin(entry.login),
    title: entry.title ?? `MT5 实时账户 ${maskLogin(entry.login)}`,
    status: nowMs - entry.receivedAtMs <= staleWindowMs() ? "live" : "stale",
    sequence: entry.sequence,
    generatedAt: new Date(entry.generatedAtMs).toISOString(),
    receivedAt: new Date(entry.receivedAtMs).toISOString(),
    positionCount: entry.positions.length,
    server: entry.server,
    currency: entry.currency,
    account: entry.account
      ? {
          balance: entry.account.balance,
          equity: entry.account.equity,
          floatingProfit: entry.account.floating_profit,
          marginFree: entry.account.margin_free,
          leverage: entry.account.leverage,
        }
      : null,
    positions: entry.positions,
  };
}

/** 列出当前所有实时信号；顺带清理长期未更新的条目。 */
export function listSignals(nowMs: number = Date.now()): PublicLiveSignal[] {
  for (const [login, entry] of entries) {
    if (nowMs - entry.receivedAtMs > PRUNE_AFTER_MS) entries.delete(login);
  }
  return [...entries.values()].sort((left, right) => right.receivedAtMs - left.receivedAtMs).map((entry) => toPublic(entry, nowMs));
}

/** 依据登录账号移除一个信号源（运维清理用途）。 */
export function deleteSignal(sourceAccount: number): boolean {
  return entries.delete(sourceAccount);
}

/** 仅测试使用：清空内存存储。 */
export function resetSigmacStoreForTests(): void {
  entries.clear();
}
