import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

const dataDir = mkdtempSync(join(tmpdir(), "signal-agent-migration-"));
const marketplaceDir = join(dataDir, "marketplace");
mkdirSync(marketplaceDir, { recursive: true });
const legacy = new Database(join(marketplaceDir, "marketplace.db"));
legacy.exec(`
  CREATE TABLE developers (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, name TEXT NOT NULL,
    created_at TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', status TEXT NOT NULL DEFAULT 'active',
    updated_at TEXT, ga_balance INTEGER NOT NULL DEFAULT 0, agent_free_uses INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE ga_transactions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES developers(id), actor_user_id TEXT,
    type TEXT NOT NULL CHECK (type IN ('admin_grant', 'admin_deduct', 'purchase', 'refund', 'agent_charge', 'agent_refund')),
    amount INTEGER NOT NULL CHECK (amount != 0), balance_after INTEGER NOT NULL, order_id TEXT, reason TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE agent_billing_requests (
    request_id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES developers(id),
    source TEXT NOT NULL CHECK (source IN ('free', 'gas', 'admin')),
    status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'committed', 'released')),
    gas_amount INTEGER NOT NULL DEFAULT 0 CHECK (gas_amount IN (0, 1)),
    charge_transaction_id TEXT, refund_transaction_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
`);
legacy.close();
process.env.SIGNAL_DATA_DIR = dataDir;

let database: typeof import("../src/lib/marketplace/db");

test.after(() => {
  database.getMarketplaceDb().close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("旧 Agent 计费表可升级到小数价格和价格快照结构", async () => {
  database = await import("../src/lib/marketplace/db");
  const db = database.getMarketplaceDb();
  const columns = db.prepare("PRAGMA table_info(agent_billing_requests)").all() as Array<{ name: string }>;
  assert.ok(columns.some((column) => column.name === "reserved_gas_amount"));
  assert.ok(columns.some((column) => column.name === "pricing_json"));
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM platform_settings").get() as { count: number }).count, 12);
});
