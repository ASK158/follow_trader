import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const dataDirectory = process.env.SIGNAL_DATA_DIR ?? join(process.cwd(), ".signal-data");
const marketplaceDirectory = join(dataDirectory, "marketplace");
const databasePath = join(marketplaceDirectory, "marketplace.db");

let instance: Database.Database | null = null;

export function getMarketplaceDb(): Database.Database {
  if (instance) return instance;
  mkdirSync(marketplaceDirectory, { recursive: true });
  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS developers (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      developer_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      developer_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('EA', '指标', '其他工具')),
      platform TEXT NOT NULL,
      category TEXT NOT NULL,
      tagline TEXT NOT NULL,
      description TEXT NOT NULL,
      price REAL NOT NULL CHECK (price >= 0),
      version TEXT NOT NULL,
      accent TEXT NOT NULL,
      cover_image TEXT,
      features TEXT NOT NULL,
      requirements TEXT NOT NULL,
      gallery TEXT NOT NULL,
      source_filename TEXT NOT NULL,
      source_path TEXT NOT NULL,
      is_template INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      review_note TEXT,
      sales INTEGER NOT NULL DEFAULT 0,
      rating REAL NOT NULL DEFAULT 5.0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
    CREATE INDEX IF NOT EXISTS idx_products_developer ON products(developer_id);
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      buyer_email TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'refunded')),
      download_token TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product_id);
    CREATE TABLE IF NOT EXISTS product_views (
      product_id TEXT PRIMARY KEY,
      views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0)
    );
    CREATE TABLE IF NOT EXISTS product_favorites (
      visitor_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (visitor_id, product_id)
    );
    CREATE INDEX IF NOT EXISTS idx_product_favorites_product ON product_favorites(product_id);
    CREATE TABLE IF NOT EXISTS product_comments (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      developer_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_product_comments_product ON product_comments(product_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_product_comments_developer ON product_comments(developer_id);
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('verify_email', 'reset_password')),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      consumed_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id, type);
    CREATE TABLE IF NOT EXISTS mfa_challenges (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS auth_rate_limits (
      scope TEXT NOT NULL,
      identifier_hash TEXT NOT NULL,
      count INTEGER NOT NULL,
      reset_at INTEGER NOT NULL,
      PRIMARY KEY (scope, identifier_hash)
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT REFERENCES developers(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      ip_hash TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS email_outbox (
      id TEXT PRIMARY KEY,
      recipient TEXT NOT NULL,
      template TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
      created_at TEXT NOT NULL,
      sent_at TEXT
    );
    CREATE TABLE IF NOT EXISTS agent_drafts (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_drafts_user ON agent_drafts(user_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS agent_usage (
      user_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
      usage_date TEXT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, usage_date)
    );
    CREATE TABLE IF NOT EXISTS agent_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      summary_text TEXT NOT NULL DEFAULT '',
      message_count INTEGER NOT NULL DEFAULT 0,
      last_message_preview TEXT NOT NULL DEFAULT '',
      retention_days INTEGER NOT NULL DEFAULT 365 CHECK (retention_days IN (30, 90, 365, 36500)),
      expires_at TEXT,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_conversations_user ON agent_conversations(user_id, deleted_at, updated_at DESC, id DESC);
    CREATE TABLE IF NOT EXISTS agent_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      request_id TEXT,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      attachments_json TEXT NOT NULL DEFAULT '[]',
      artifact_json TEXT,
      model_content TEXT,
      status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
      provider_latency_ms INTEGER,
      compile_latency_ms INTEGER,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      UNIQUE (conversation_id, seq),
      UNIQUE (request_id, role)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_messages_conversation ON agent_messages(conversation_id, seq DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_messages_user ON agent_messages(user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS agent_compile_jobs (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      conversation_id TEXT REFERENCES agent_conversations(id) ON DELETE SET NULL,
      user_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
      strategy_name TEXT NOT NULL,
      code_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
      result_json TEXT,
      last_error TEXT,
      queued_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_compile_jobs_status ON agent_compile_jobs(status, queued_at);
    CREATE TABLE IF NOT EXISTS agent_compile_slots (
      slot_number INTEGER PRIMARY KEY,
      job_id TEXT UNIQUE REFERENCES agent_compile_jobs(id) ON DELETE SET NULL,
      claimed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS agent_provider_circuits (
      circuit_key TEXT PRIMARY KEY,
      failure_count INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT 'closed' CHECK (state IN ('closed', 'open', 'half-open')),
      opened_until INTEGER,
      probe_started_at INTEGER,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_request_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL,
      conversation_id TEXT,
      user_id TEXT,
      event_type TEXT NOT NULL,
      duration_ms INTEGER,
      input_tokens INTEGER,
      output_tokens INTEGER,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_request_events_created ON agent_request_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_request_events_request ON agent_request_events(request_id, id);
    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_free_usage (
      user_id TEXT PRIMARY KEY REFERENCES developers(id) ON DELETE CASCADE,
      used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS registration_signals (
      user_id TEXT PRIMARY KEY REFERENCES developers(id) ON DELETE CASCADE,
      ip_hash TEXT NOT NULL,
      device_hash TEXT NOT NULL,
      email_domain TEXT NOT NULL,
      risk_score INTEGER NOT NULL DEFAULT 0 CHECK (risk_score >= 0),
      risk_flags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_registration_signals_ip ON registration_signals(ip_hash, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_registration_signals_device ON registration_signals(device_hash, created_at DESC);
    CREATE TABLE IF NOT EXISTS tutorials (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('article', 'video')),
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      category TEXT NOT NULL,
      level TEXT NOT NULL CHECK (level IN ('入门', '进阶', '实战')),
      duration TEXT NOT NULL,
      platform TEXT,
      external_url TEXT,
      content TEXT,
      accent TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tutorials_status ON tutorials(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tutorials_author ON tutorials(author_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS observation_accounts (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      platform TEXT NOT NULL CHECK (platform IN ('MT4', 'MT5')),
      account_type TEXT NOT NULL CHECK (account_type IN ('真实账号', '模拟账号')),
      account_number TEXT NOT NULL,
      server_name TEXT NOT NULL,
      investor_password TEXT NOT NULL,
      description TEXT NOT NULL,
      views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_observation_accounts_updated ON observation_accounts(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_observation_accounts_owner ON observation_accounts(owner_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS observation_comments (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES observation_accounts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_hidden INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_observation_comments_account ON observation_comments(account_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS crypto_recharges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT 'nowpayments' CHECK (provider = 'nowpayments'),
      asset TEXT NOT NULL DEFAULT 'USDT' CHECK (asset = 'USDT'),
      network TEXT NOT NULL DEFAULT 'TRC20' CHECK (network = 'TRC20'),
      amount_cents INTEGER NOT NULL CHECK (amount_cents BETWEEN 200 AND 50000),
      gas_cents INTEGER NOT NULL DEFAULT 0 CHECK (gas_cents >= 0),
      provider_payment_id TEXT UNIQUE,
      provider_parent_payment_id TEXT,
      pay_address TEXT,
      pay_amount TEXT,
      actually_paid TEXT,
      provider_status TEXT,
      status TEXT NOT NULL DEFAULT 'creating' CHECK (status IN ('creating', 'waiting', 'confirming', 'confirmed', 'sending', 'review_required', 'credited', 'expired', 'failed', 'cancelled')),
      ga_transaction_id TEXT UNIQUE,
      expires_at TEXT,
      credited_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_crypto_recharges_user ON crypto_recharges(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_crypto_recharges_status ON crypto_recharges(status, updated_at);
    CREATE TABLE IF NOT EXISTS crypto_webhook_events (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 'nowpayments' CHECK (provider = 'nowpayments'),
      provider_payment_id TEXT,
      signature TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'failed')),
      error TEXT,
      received_at TEXT NOT NULL,
      processed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_crypto_webhook_payment ON crypto_webhook_events(provider_payment_id, received_at DESC);
  `);
  const addColumn = (table: string, column: string, definition: string) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  };
  addColumn("developers", "role", "TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'))");
  addColumn("developers", "status", "TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended'))");
  addColumn("developers", "email_verified_at", "TEXT");
  addColumn("developers", "updated_at", "TEXT");
  addColumn("developers", "last_login_at", "TEXT");
  addColumn("developers", "totp_secret", "TEXT");
  addColumn("developers", "totp_enabled", "INTEGER NOT NULL DEFAULT 0");
  addColumn("developers", "ga_balance", "INTEGER NOT NULL DEFAULT 0 CHECK (ga_balance >= 0)");
  addColumn("developers", "agent_free_uses", "INTEGER NOT NULL DEFAULT 0 CHECK (agent_free_uses >= 0 AND agent_free_uses <= 5)");
  addColumn("developers", "agent_free_eligible", "INTEGER NOT NULL DEFAULT 1 CHECK (agent_free_eligible IN (0, 1))");
  addColumn("developers", "registration_risk_score", "INTEGER NOT NULL DEFAULT 0 CHECK (registration_risk_score >= 0)");
  addColumn("developers", "registration_risk_flags", "TEXT NOT NULL DEFAULT '[]'");
  addColumn("developers", "username", "TEXT");
  addColumn("developers", "avatar_filename", "TEXT");
  addColumn("developers", "bio", "TEXT NOT NULL DEFAULT ''");
  addColumn("developers", "contact", "TEXT NOT NULL DEFAULT ''");
  addColumn("developers", "website_url", "TEXT NOT NULL DEFAULT ''");
  addColumn("developers", "location", "TEXT NOT NULL DEFAULT ''");
  addColumn("developers", "contact_visibility", "TEXT NOT NULL DEFAULT 'signed_in' CHECK (contact_visibility IN ('public', 'signed_in', 'followers', 'private'))");
  addColumn("developers", "followers_visibility", "TEXT NOT NULL DEFAULT 'public' CHECK (followers_visibility IN ('public', 'followers', 'private'))");
  addColumn("developers", "following_visibility", "TEXT NOT NULL DEFAULT 'public' CHECK (following_visibility IN ('public', 'followers', 'private'))");
  addColumn("developers", "favorites_visibility", "TEXT NOT NULL DEFAULT 'private' CHECK (favorites_visibility IN ('public', 'private'))");
  addColumn("developers", "message_permission", "TEXT NOT NULL DEFAULT 'followers' CHECK (message_permission IN ('everyone', 'followers', 'mutual', 'none'))");
  addColumn("sessions", "token_hash", "TEXT");
  addColumn("sessions", "created_at", "TEXT");
  addColumn("sessions", "last_seen_at", "TEXT");
  addColumn("sessions", "user_agent", "TEXT");
  addColumn("sessions", "ip_hash", "TEXT");
  addColumn("orders", "buyer_user_id", "TEXT REFERENCES developers(id) ON DELETE SET NULL");
  addColumn("orders", "currency", "TEXT NOT NULL DEFAULT 'GA' CHECK (currency = 'GA')");
  addColumn("product_favorites", "user_id", "TEXT REFERENCES developers(id) ON DELETE CASCADE");
  addColumn("product_comments", "is_hidden", "INTEGER NOT NULL DEFAULT 0");
  addColumn("product_comments", "moderation_note", "TEXT");
  const usersWithoutUsername = db.prepare("SELECT id FROM developers WHERE username IS NULL OR username = ''").all() as Array<{ id: string }>;
  const assignUsername = db.prepare("UPDATE developers SET username = ? WHERE id = ?");
  for (const user of usersWithoutUsername) assignUsername.run(`user_${user.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12).toLowerCase()}`, user.id);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_developers_username ON developers(username COLLATE NOCASE) WHERE username IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash) WHERE token_hash IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(developer_id, expires_at DESC);
    CREATE INDEX IF NOT EXISTS idx_orders_buyer_user ON orders(buyer_user_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_user_product ON product_favorites(user_id, product_id) WHERE user_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS user_follows (
      follower_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
      following_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (follower_id, following_id),
      CHECK (follower_id <> following_id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_follows_following ON user_follows(following_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows(follower_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS direct_conversations (
      id TEXT PRIMARY KEY,
      user_a_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
      user_b_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_a_id, user_b_id),
      CHECK (user_a_id < user_b_id)
    );
    CREATE INDEX IF NOT EXISTS idx_direct_conversations_a ON direct_conversations(user_a_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_direct_conversations_b ON direct_conversations(user_b_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS direct_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation ON direct_messages(conversation_id, created_at ASC);
    CREATE TABLE IF NOT EXISTS direct_message_reads (
      conversation_id TEXT NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
      last_read_at TEXT NOT NULL,
      PRIMARY KEY (conversation_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS ga_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
      actor_user_id TEXT REFERENCES developers(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK (type IN ('admin_grant', 'admin_deduct', 'purchase', 'refund')),
      amount INTEGER NOT NULL CHECK (amount != 0),
      balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
      order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ga_transactions_user ON ga_transactions(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ga_transactions_created ON ga_transactions(created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ga_transactions_purchase_order ON ga_transactions(order_id, type) WHERE order_id IS NOT NULL;
  `);
  const now = new Date().toISOString();
  const defaultSettings: Record<string, string> = {
    agent_free_usage_limit: "5",
    agent_chat_cost: "0.1",
    agent_modify_cost: "0.5",
    agent_generate_cost: "1",
    agent_minimum_gas_to_start: "1",
    agent_retention_days: "365",
    registration_ip_daily_limit: "3",
    registration_device_30d_limit: "2",
    registration_risk_threshold: "50",
    social_telegram_url: "",
    social_wechat_official_account_url: "",
    social_youtube_url: "",
    social_bilibili_url: "",
  };
  const insertDefaultSetting = db.prepare("INSERT OR IGNORE INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?)");
  for (const [key, value] of Object.entries(defaultSettings)) insertDefaultSetting.run(key, value, now);
  db.prepare(`
    INSERT OR IGNORE INTO agent_free_usage (user_id, used_count, updated_at)
    SELECT id, agent_free_uses, COALESCE(updated_at, created_at) FROM developers
  `).run();
  const gaTransactionsSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ga_transactions'").get() as { sql: string };
  if (!gaTransactionsSchema.sql.includes("'agent_charge'")) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      ALTER TABLE ga_transactions RENAME TO ga_transactions_legacy;
      CREATE TABLE ga_transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
        actor_user_id TEXT REFERENCES developers(id) ON DELETE SET NULL,
        type TEXT NOT NULL CHECK (type IN ('admin_grant', 'admin_deduct', 'purchase', 'refund', 'agent_charge', 'agent_refund')),
        amount INTEGER NOT NULL CHECK (amount != 0),
        balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
        order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      INSERT INTO ga_transactions SELECT * FROM ga_transactions_legacy;
      DROP TABLE ga_transactions_legacy;
      CREATE INDEX idx_ga_transactions_user ON ga_transactions(user_id, created_at DESC);
      CREATE INDEX idx_ga_transactions_created ON ga_transactions(created_at DESC);
      CREATE UNIQUE INDEX idx_ga_transactions_purchase_order ON ga_transactions(order_id, type) WHERE order_id IS NOT NULL;
      INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES ('agent-gas-ledger-v1', '${now}');
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }
  const rechargeLedgerSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ga_transactions'").get() as { sql: string };
  if (!rechargeLedgerSchema.sql.includes("'crypto_recharge'")) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      ALTER TABLE ga_transactions RENAME TO ga_transactions_legacy;
      CREATE TABLE ga_transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
        actor_user_id TEXT REFERENCES developers(id) ON DELETE SET NULL,
        type TEXT NOT NULL CHECK (type IN ('admin_grant', 'admin_deduct', 'purchase', 'refund', 'agent_charge', 'agent_refund', 'crypto_recharge')),
        amount REAL NOT NULL CHECK (amount != 0),
        balance_after REAL NOT NULL CHECK (balance_after >= 0),
        order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      INSERT INTO ga_transactions SELECT * FROM ga_transactions_legacy;
      DROP TABLE ga_transactions_legacy;
      CREATE INDEX idx_ga_transactions_user ON ga_transactions(user_id, created_at DESC);
      CREATE INDEX idx_ga_transactions_created ON ga_transactions(created_at DESC);
      CREATE UNIQUE INDEX idx_ga_transactions_purchase_order ON ga_transactions(order_id, type) WHERE order_id IS NOT NULL;
      INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES ('crypto-recharge-ledger-v1', '${now}');
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }
  const rechargeSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'crypto_recharges'").get() as { sql: string };
  if (rechargeSchema.sql.includes("BETWEEN 500 AND 50000")) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      ALTER TABLE crypto_recharges RENAME TO crypto_recharges_legacy;
      CREATE TABLE crypto_recharges (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
        provider TEXT NOT NULL DEFAULT 'nowpayments' CHECK (provider = 'nowpayments'),
        asset TEXT NOT NULL DEFAULT 'USDT' CHECK (asset = 'USDT'),
        network TEXT NOT NULL DEFAULT 'TRC20' CHECK (network = 'TRC20'),
        amount_cents INTEGER NOT NULL CHECK (amount_cents BETWEEN 200 AND 50000),
        gas_cents INTEGER NOT NULL DEFAULT 0 CHECK (gas_cents >= 0),
        provider_payment_id TEXT UNIQUE,
        provider_parent_payment_id TEXT,
        pay_address TEXT,
        pay_amount TEXT,
        actually_paid TEXT,
        provider_status TEXT,
        status TEXT NOT NULL DEFAULT 'creating' CHECK (status IN ('creating', 'waiting', 'confirming', 'confirmed', 'sending', 'review_required', 'credited', 'expired', 'failed', 'cancelled')),
        ga_transaction_id TEXT UNIQUE,
        expires_at TEXT,
        credited_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO crypto_recharges SELECT * FROM crypto_recharges_legacy;
      DROP TABLE crypto_recharges_legacy;
      CREATE INDEX idx_crypto_recharges_user ON crypto_recharges(user_id, created_at DESC);
      CREATE INDEX idx_crypto_recharges_status ON crypto_recharges(status, updated_at);
      INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES ('crypto-recharge-minimum-2-v1', '${now}');
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_billing_requests (
      request_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (source IN ('free', 'gas', 'admin')),
      status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'committed', 'released')),
      action TEXT NOT NULL DEFAULT 'generate' CHECK (action IN ('chat', 'modify', 'generate')),
      reserved_gas_amount REAL NOT NULL DEFAULT 0 CHECK (reserved_gas_amount >= 0),
      gas_amount REAL NOT NULL DEFAULT 0 CHECK (gas_amount >= 0),
      pricing_json TEXT NOT NULL DEFAULT '{}',
      charge_transaction_id TEXT REFERENCES ga_transactions(id) ON DELETE SET NULL,
      refund_transaction_id TEXT REFERENCES ga_transactions(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_billing_user ON agent_billing_requests(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_billing_status ON agent_billing_requests(status, created_at);
  `);
  const agentBillingSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'agent_billing_requests'").get() as { sql: string };
  if (!agentBillingSchema.sql.includes("reserved_gas_amount")) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      ALTER TABLE agent_billing_requests RENAME TO agent_billing_requests_legacy;
      CREATE TABLE agent_billing_requests (
        request_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
        source TEXT NOT NULL CHECK (source IN ('free', 'gas', 'admin')),
        status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'committed', 'released')),
        action TEXT NOT NULL DEFAULT 'generate' CHECK (action IN ('chat', 'modify', 'generate')),
        reserved_gas_amount REAL NOT NULL DEFAULT 0 CHECK (reserved_gas_amount >= 0),
        gas_amount REAL NOT NULL DEFAULT 0 CHECK (gas_amount >= 0),
        pricing_json TEXT NOT NULL DEFAULT '{}',
        charge_transaction_id TEXT REFERENCES ga_transactions(id) ON DELETE SET NULL,
        refund_transaction_id TEXT REFERENCES ga_transactions(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO agent_billing_requests (
        request_id, user_id, source, status, action, reserved_gas_amount, gas_amount, pricing_json,
        charge_transaction_id, refund_transaction_id, created_at, updated_at
      )
      SELECT request_id, user_id, source, status, 'generate', gas_amount, gas_amount, '{}',
        charge_transaction_id, refund_transaction_id, created_at, updated_at
      FROM agent_billing_requests_legacy;
      DROP TABLE agent_billing_requests_legacy;
      CREATE INDEX idx_agent_billing_user ON agent_billing_requests(user_id, created_at DESC);
      CREATE INDEX idx_agent_billing_status ON agent_billing_requests(status, created_at);
      INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES ('agent-tiered-billing-v2', '${now}');
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }
  addColumn("agent_billing_requests", "pricing_json", "TEXT NOT NULL DEFAULT '{}'");
  const agentBillingForeignKeys = db.prepare("PRAGMA foreign_key_list(agent_billing_requests)").all() as Array<{ table: string }>;
  if (agentBillingForeignKeys.some((foreignKey) => foreignKey.table === "ga_transactions_legacy")) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      ALTER TABLE agent_billing_requests RENAME TO agent_billing_requests_legacy;
      CREATE TABLE agent_billing_requests (
        request_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
        source TEXT NOT NULL CHECK (source IN ('free', 'gas', 'admin')),
        status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'committed', 'released')),
        action TEXT NOT NULL DEFAULT 'generate' CHECK (action IN ('chat', 'modify', 'generate')),
        reserved_gas_amount REAL NOT NULL DEFAULT 0 CHECK (reserved_gas_amount >= 0),
        gas_amount REAL NOT NULL DEFAULT 0 CHECK (gas_amount >= 0),
        pricing_json TEXT NOT NULL DEFAULT '{}',
        charge_transaction_id TEXT REFERENCES ga_transactions(id) ON DELETE SET NULL,
        refund_transaction_id TEXT REFERENCES ga_transactions(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO agent_billing_requests (
        request_id, user_id, source, status, action, reserved_gas_amount, gas_amount, pricing_json,
        charge_transaction_id, refund_transaction_id, created_at, updated_at
      )
      SELECT request_id, user_id, source, status, action, reserved_gas_amount, gas_amount, pricing_json,
        charge_transaction_id, refund_transaction_id, created_at, updated_at
      FROM agent_billing_requests_legacy;
      DROP TABLE agent_billing_requests_legacy;
      CREATE INDEX idx_agent_billing_user ON agent_billing_requests(user_id, created_at DESC);
      CREATE INDEX idx_agent_billing_status ON agent_billing_requests(status, created_at);
      INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES ('agent-billing-ledger-foreign-key-v1', '${now}');
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }
  db.prepare("UPDATE developers SET updated_at = COALESCE(updated_at, created_at)").run();
  const emailVerificationMigration = db.prepare("SELECT 1 FROM schema_migrations WHERE name = 'email-verification-v1'").get();
  if (!emailVerificationMigration) {
    db.transaction(() => {
      // 迁移前的旧账户没有验证令牌，视为已验证以保持兼容；新注册账户必须消费令牌。
      db.prepare(`
        UPDATE developers SET email_verified_at = COALESCE(email_verified_at, created_at)
        WHERE NOT EXISTS (
          SELECT 1 FROM auth_tokens
          WHERE auth_tokens.user_id = developers.id AND auth_tokens.type = 'verify_email'
        )
      `).run();
      // 修复旧启动逻辑可能误验证、但仍持有未消费验证令牌的账户。
      db.prepare(`
        UPDATE developers SET email_verified_at = NULL
        WHERE EXISTS (
          SELECT 1 FROM auth_tokens
          WHERE auth_tokens.user_id = developers.id
            AND auth_tokens.type = 'verify_email' AND auth_tokens.consumed_at IS NULL
        )
      `).run();
      db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES ('email-verification-v1', ?)").run(now);
    })();
  }
  const roleMigration = db.prepare("SELECT 1 FROM schema_migrations WHERE name = 'roles-v1'").get();
  if (!roleMigration) {
    const configuredAdmins = (process.env.MARKETPLACE_ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
    const promote = db.prepare("UPDATE developers SET role = 'admin', updated_at = ? WHERE lower(email) = ?");
    const migrateRoles = db.transaction(() => {
      for (const email of configuredAdmins) promote.run(now, email);
      db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES ('roles-v1', ?)").run(now);
    });
    migrateRoles();
  }
  const productsSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'products'").get() as { sql: string };
  if (!productsSchema.sql.includes("'其他工具'")) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      ALTER TABLE products RENAME TO products_legacy;
      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        developer_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('EA', '指标', '其他工具')),
        platform TEXT NOT NULL,
        category TEXT NOT NULL,
        tagline TEXT NOT NULL,
        description TEXT NOT NULL,
        price REAL NOT NULL CHECK (price >= 0),
        version TEXT NOT NULL,
        accent TEXT NOT NULL,
        features TEXT NOT NULL,
        requirements TEXT NOT NULL,
        gallery TEXT NOT NULL,
        source_filename TEXT NOT NULL,
        source_path TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        review_note TEXT,
        sales INTEGER NOT NULL DEFAULT 0,
        rating REAL NOT NULL DEFAULT 5.0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO products SELECT * FROM products_legacy;
      DROP TABLE products_legacy;
      CREATE INDEX idx_products_status ON products(status);
      CREATE INDEX idx_products_developer ON products(developer_id);
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }
  const productColumns = db.prepare("PRAGMA table_info(products)").all() as Array<{ name: string }>;
  if (!productColumns.some((column) => column.name === "is_template")) {
    db.exec("ALTER TABLE products ADD COLUMN is_template INTEGER NOT NULL DEFAULT 0");
  }
  addColumn("products", "cover_image", "TEXT");
  instance = db;
  return db;
}

export function getMarketplaceStorageDirectory(): string {
  const directory = join(marketplaceDirectory, "sources");
  mkdirSync(directory, { recursive: true });
  return directory;
}
