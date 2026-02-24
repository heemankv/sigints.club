export const schemaSql = `
ALTER TABLE IF EXISTS bots RENAME TO agents;
ALTER TABLE IF EXISTS subscriptions RENAME TO agent_subscriptions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agent_subscriptions' AND column_name = 'bot_id'
  ) THEN
    EXECUTE 'ALTER TABLE agent_subscriptions RENAME COLUMN bot_id TO agent_id';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agent_subscriptions' AND column_name = 'listener_wallet'
  ) THEN
    EXECUTE 'ALTER TABLE agent_subscriptions RENAME COLUMN listener_wallet TO owner_wallet';
  END IF;
END $$;

ALTER TABLE IF EXISTS agents ADD COLUMN IF NOT EXISTS stream_id TEXT;
ALTER TABLE IF EXISTS agent_subscriptions ADD COLUMN IF NOT EXISTS stream_id TEXT;
ALTER TABLE IF EXISTS agent_subscriptions ADD COLUMN IF NOT EXISTS visibility TEXT;
ALTER TABLE IF EXISTS agent_subscriptions ADD COLUMN IF NOT EXISTS updated_at BIGINT;
ALTER TABLE IF EXISTS agents ADD COLUMN IF NOT EXISTS agent_pubkey TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS wallet_key_registered_at BIGINT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS wallet_key_public_key TEXT;

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

CREATE TABLE IF NOT EXISTS signals_events (
  id BIGSERIAL PRIMARY KEY,
  stream_id TEXT NOT NULL,
  tier_id TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('public','private')),
  signal_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL,
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
CREATE INDEX IF NOT EXISTS signals_events_by_stream ON signals_events (stream_id, id DESC);
CREATE INDEX IF NOT EXISTS signals_events_by_created ON signals_events (created_at DESC);

INSERT INTO signals_events (stream_id, tier_id, visibility, signal_hash, created_at, onchain_tx)
SELECT s.stream_id, s.tier_id, s.visibility, s.signal_hash, s.created_at, s.onchain_tx
FROM signals_latest s
WHERE NOT EXISTS (
  SELECT 1 FROM signals_events e
  WHERE e.stream_id = s.stream_id AND e.signal_hash = s.signal_hash
);

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

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  owner_wallet TEXT NOT NULL,
  agent_pubkey TEXT,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('maker','listener')),
  stream_id TEXT,
  domain TEXT NOT NULL,
  description TEXT,
  evidence TEXT NOT NULL CHECK (evidence IN ('trust','verifier','hybrid')),
  tiers JSONB,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_subscriptions (
  id TEXT PRIMARY KEY,
  owner_wallet TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  stream_id TEXT NOT NULL,
  tier_id TEXT NOT NULL,
  pricing_type TEXT NOT NULL,
  evidence_level TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  visibility TEXT,
  onchain_tx TEXT
);

CREATE TABLE IF NOT EXISTS users (
  wallet_address TEXT PRIMARY KEY,
  display_name TEXT,
  bio TEXT,
  tapestry_profile_id TEXT,
  wallet_key_registered_at BIGINT,
  wallet_key_public_key TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
`;
