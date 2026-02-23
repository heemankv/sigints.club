export const schemaSql = `
CREATE TABLE IF NOT EXISTS signals_latest (
  stream_id TEXT PRIMARY KEY,
  tier_id TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('public','private')),
  signal_hash TEXT NOT NULL UNIQUE,
  payload_json JSONB NOT NULL,
  keybox_hash TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  onchain_tx TEXT
);

CREATE TABLE IF NOT EXISTS keyboxes_latest (
  stream_id TEXT NOT NULL REFERENCES signals_latest(stream_id) ON DELETE CASCADE,
  subscriber_id TEXT NOT NULL,
  wrapped_key_json JSONB NOT NULL,
  keybox_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (stream_id, subscriber_id)
);

CREATE INDEX IF NOT EXISTS keyboxes_by_hash ON keyboxes_latest (keybox_hash);
CREATE INDEX IF NOT EXISTS signals_by_hash ON signals_latest (signal_hash);

CREATE TABLE IF NOT EXISTS streams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  description TEXT NOT NULL,
  visibility TEXT,
  evidence TEXT NOT NULL,
  accuracy TEXT NOT NULL,
  latency TEXT NOT NULL,
  price TEXT NOT NULL,
  tiers JSONB NOT NULL,
  owner_wallet TEXT NOT NULL,
  tapestry_profile_id TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS bots (
  id TEXT PRIMARY KEY,
  owner_wallet TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('maker','listener')),
  domain TEXT NOT NULL,
  description TEXT,
  evidence TEXT NOT NULL CHECK (evidence IN ('trust','verifier','hybrid')),
  tiers JSONB,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  listener_wallet TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  tier_id TEXT NOT NULL,
  pricing_type TEXT NOT NULL,
  evidence_level TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  onchain_tx TEXT
);

CREATE TABLE IF NOT EXISTS users (
  wallet_address TEXT PRIMARY KEY,
  display_name TEXT,
  bio TEXT,
  tapestry_profile_id TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
`;
