import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteSignal,
  ingestSnapshot,
  listSignals,
  maskLogin,
  resetSigmacStoreForTests,
  staleWindowMs,
} from "../src/lib/sigmac/relay-store";

const ACCOUNT = 12345678;

function validSnapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Date.now();
  return {
    schema: "sigmac-snapshot/v1",
    snapshot_complete: true,
    sequence: 2000,
    source_account: ACCOUNT,
    generated_at_unix_ms: now,
    expires_at_unix_ms: now + 10_000,
    position_count: 1,
    positions: [
      {
        source_id: "111",
        symbol: "XAUUSD",
        side: "BUY",
        volume: 0.1,
        sl: 0,
        tp: 0,
        price_open: 4000.5,
        opened_at_unix_ms: now,
        source_magic: 0,
      },
    ],
    account: {
      login: ACCOUNT,
      server: "Demo-Server",
      currency: "USD",
      leverage: 200,
      balance: 5000,
      equity: 5010,
      margin: 100,
      margin_free: 4910,
      floating_profit: 10,
    },
    title: "测试实时信号",
    ...overrides,
  };
}

test("有效快照被接收并以脱敏形式公开", () => {
  resetSigmacStoreForTests();
  const now = Date.now();
  const result = ingestSnapshot(validSnapshot(), now);
  assert.equal(result.ok, true);

  const signals = listSignals(now);
  assert.equal(signals.length, 1);
  const signal = signals[0];
  assert.equal(signal.id, "12***78");
  assert.equal(signal.title, "测试实时信号");
  assert.equal(signal.status, "live");
  assert.equal(signal.positionCount, 1);
  assert.equal(signal.account?.balance, 5000);
  assert.equal(signal.positions[0].symbol, "XAUUSD");
});

test("schema、完整性标记与计数不一致的快照被拒绝", () => {
  resetSigmacStoreForTests();
  assert.equal(ingestSnapshot(validSnapshot({ schema: "other/v9" }), Date.now()).ok, false);
  assert.equal(ingestSnapshot(validSnapshot({ snapshot_complete: false }), Date.now()).ok, false);
  assert.equal(ingestSnapshot(validSnapshot({ position_count: 2 }), Date.now()).ok, false);
  assert.equal(ingestSnapshot(validSnapshot({ positions: "not-array", position_count: 0 }), Date.now()).ok, false);
  assert.equal(listSignals().length, 0);
});

test("重复 source_id、无效方向与异常有效期被拒绝", () => {
  resetSigmacStoreForTests();
  const now = Date.now();
  const duplicated = validSnapshot({
    position_count: 2,
    positions: [
      { source_id: "1", symbol: "XAUUSD", side: "BUY", volume: 0.1, sl: 0, tp: 0, price_open: 1, opened_at_unix_ms: now, source_magic: 0 },
      { source_id: "1", symbol: "EURUSD", side: "SELL", volume: 0.1, sl: 0, tp: 0, price_open: 1, opened_at_unix_ms: now, source_magic: 0 },
    ],
  });
  assert.equal(ingestSnapshot(duplicated, now).ok, false);
  assert.equal(ingestSnapshot(validSnapshot({ positions: [{ source_id: "1", symbol: "XAUUSD", side: "HOLD", volume: 0.1, sl: 0, tp: 0, price_open: 1, opened_at_unix_ms: now, source_magic: 0 }] }), now).ok, false);
  assert.equal(
    ingestSnapshot(validSnapshot({ generated_at_unix_ms: now, expires_at_unix_ms: now + 61_000 }), now).ok,
    false,
  );
});

test("序号回退的快照被拒绝，新序号正常接收", () => {
  resetSigmacStoreForTests();
  const now = Date.now();
  assert.equal(ingestSnapshot(validSnapshot({ sequence: 3000 }), now).ok, true);
  const replay = ingestSnapshot(validSnapshot({ sequence: 2999 }), now + 1);
  assert.equal(replay.ok, false);
  if (!replay.ok) assert.match(replay.error, /更旧/);
  assert.equal(ingestSnapshot(validSnapshot({ sequence: 3001 }), now + 2).ok, true);
});

test("account.login 与 source_account 不一致被拒绝", () => {
  resetSigmacStoreForTests();
  assert.equal(ingestSnapshot(validSnapshot({ account: { login: 999, server: "S", currency: "USD", leverage: 100, balance: 1, equity: 1, margin: 0, margin_free: 1, floating_profit: 0 } }), Date.now()).ok, false);
});

test("超过新鲜窗口的信号标记为 stale", () => {
  resetSigmacStoreForTests();
  const now = Date.now();
  ingestSnapshot(validSnapshot(), now);
  const signals = listSignals(now + staleWindowMs() + 1_000);
  assert.equal(signals[0].status, "stale");
});

test("运维删除接口按账号移除信号", () => {
  resetSigmacStoreForTests();
  ingestSnapshot(validSnapshot(), Date.now());
  assert.equal(deleteSignal(ACCOUNT), true);
  assert.equal(deleteSignal(ACCOUNT), false);
  assert.equal(listSignals().length, 0);
});

test("短账号脱敏不会泄露数字", () => {
  assert.equal(maskLogin(1234), "***");
  assert.equal(maskLogin(12345), "12***45");
});
