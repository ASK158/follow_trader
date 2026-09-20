import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

const dataDir = mkdtempSync(join(tmpdir(), "signal-agent-ledger-fk-test-"));
const marketplaceDir = join(dataDir, "marketplace");
mkdirSync(marketplaceDir, { recursive: true });
const legacy = new Database(join(marketplaceDir, "marketplace.db"));
legacy.exec(`
  CREATE TABLE developers (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, name TEXT NOT NULL,
    created_at TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', status TEXT NOT NULL DEFAULT 'active',
    updated_at TEXT, ga_balance REAL NOT NULL DEFAULT 0, agent_free_uses INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE ga_transactions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES developers(id), actor_user_id TEXT,
    type TEXT NOT NULL CHECK (type IN ('admin_grant', 'admin_deduct', 'purchase', 'refund', 'agent_charge', 'agent_refund')),
    amount INTEGER NOT NULL CHECK (amount != 0), balance_after INTEGER NOT NULL, order_id TEXT, reason TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE agent_billing_requests (
    request_id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('free', 'gas', 'admin')),
    status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'committed', 'released')),
    action TEXT NOT NULL DEFAULT 'generate' CHECK (action IN ('chat', 'modify', 'generate')),
    reserved_gas_amount REAL NOT NULL DEFAULT 0 CHECK (reserved_gas_amount >= 0),
    gas_amount REAL NOT NULL DEFAULT 0 CHECK (gas_amount >= 0), pricing_json TEXT NOT NULL DEFAULT '{}',
    charge_transaction_id TEXT REFERENCES ga_transactions(id) ON DELETE SET NULL,
    refund_transaction_id TEXT REFERENCES ga_transactions(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
`);
legacy.close();
process.env.SIGNAL_DATA_DIR = dataDir;

let database: typeof import("../src/lib/marketplace/db");

test.after(() => {
  database.getMarketplaceDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("账本升级后 Agent 计费外键仍指向当前账本表", async () => {
  database = await import("../src/lib/marketplace/db");
  const db = database.getMarketplaceDb();
  const foreignKeys = db.prepare("PRAGMA foreign_key_list(agent_billing_requests)").all() as Array<{ table: string }>;
  assert.equal(foreignKeys.some((foreignKey) => foreignKey.table === "ga_transactions_legacy"), false);
  assert.equal(foreignKeys.filter((foreignKey) => foreignKey.table === "ga_transactions").length, 2);

  const now = new Date().toISOString();
  db.prepare("INSERT INTO developers (id, email, password_hash, name, role, status, created_at, updated_at) VALUES ('agent-fk-user', 'agent-fk@test.local', 'x:y', 'Agent FK', 'admin', 'active', ?, ?)").run(now, now);
  assert.doesNotThrow(() => db.prepare(`
    INSERT INTO agent_billing_requests (request_id, user_id, source, action, reserved_gas_amount, gas_amount, pricing_json, created_at, updated_at)
    VALUES ('agent-fk-request', 'agent-fk-user', 'admin', 'generate', 0, 0, '{}', ?, ?)
  `).run(now, now));
});