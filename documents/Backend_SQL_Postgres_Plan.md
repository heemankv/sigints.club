# Plan: Move Backend Storage to Postgres (Clean Slate)

## Goal
Replace local file storage with Postgres. Run Postgres via Docker. No data migration required.

## Scope (What Moves to SQL)
- **Signals storage** (public + private payloads, latest-only per stream).
- **Signal metadata** (replaces `metadata.json`).
- **Stream registry cache** (replaces `streams.json`).
- **Bots** (replaces `bots.json`).
- **Subscriptions** (replaces `subscriptions.json`).
- **Users**: moving identity to Tapestry; only keep a minimal `wallet -> profileId` cache table if needed.

## Docker Postgres Setup
1. Add `docker-compose.yml` (or `docker/postgres.yml`) with:
   - `postgres:16` image
   - `POSTGRES_DB=sigints`, `POSTGRES_USER=sigints`, `POSTGRES_PASSWORD=sigints`
   - Port `5432:5432`
   - Named volume for persistence

2. Add backend env vars:
   - `DATABASE_URL=postgresql://sigints:sigints@localhost:5432/sigints`

## Database Schema (Latest-Only Signals)
```sql
-- Signals: one row per stream (latest only)
CREATE TABLE signals_latest (
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

-- Keyboxes: one row per subscriber (latest only)
CREATE TABLE keyboxes_latest (
  stream_id TEXT NOT NULL REFERENCES signals_latest(stream_id) ON DELETE CASCADE,
  subscriber_id TEXT NOT NULL,
  wrapped_key_json JSONB NOT NULL,
  keybox_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (stream_id, subscriber_id)
);
CREATE INDEX keyboxes_by_hash ON keyboxes_latest (keybox_hash);
CREATE INDEX signals_by_hash ON signals_latest (signal_hash);

-- Streams (replaces streams.json)
CREATE TABLE streams (
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

-- Bots (replaces bots.json)
CREATE TABLE bots (
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

-- Subscriptions (replaces subscriptions.json)
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  listener_wallet TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  tier_id TEXT NOT NULL,
  pricing_type TEXT NOT NULL,
  evidence_level TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  onchain_tx TEXT
);

-- Optional minimal cache for profileId (only if needed)
CREATE TABLE user_profile_cache (
  wallet_address TEXT PRIMARY KEY,
  tapestry_profile_id TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);
```

## Backend Changes
1. **Add DB client**
   - Use `pg` (node-postgres) for minimal setup.
   - Create `backend/src/db/index.ts` to manage pool + helpers.

2. **Implement SQL store providers**
   - `SqlMetadataStore` or inline usage (signals_latest + keyboxes_latest).
   - `SqlStreamStore` for streams.
   - `SqlBotStore` for bots.
   - `SqlSubscriptionStore` for subscriptions.
   - Optional `SqlUserProfileCache` for wallet -> tapestryProfileId.

3. **Update SignalService**
   - Replace `StorageProvider` + `MetadataStore` usage for signals with SQL writes:
     - On publish: upsert `signals_latest` by `stream_id`.
     - For private: delete + insert `keyboxes_latest` rows for the stream.
   - For public: no keybox rows.

4. **Update Routes**
   - `/storage/public/:sha` and `/storage/ciphertext/:sha`:
     - Query `signals_latest` by `signal_hash` and return `payload_json`.
   - `/storage/keybox/:sha`:
     - Query `keyboxes_latest` by `keybox_hash`.
   - `/signals` + `/signals/latest` + `/signals/by-hash/:hash`:
     - Query `signals_latest`.

5. **ServiceContainer wiring**
   - Use SQL stores when `DATABASE_URL` is set.
   - Remove local file storage dependencies in production mode.

## Tests
- Update integration tests to use Postgres (docker service in CI/dev).
- Add a test DB reset helper (truncate tables) before each suite.

## Cutover Plan (Clean Swipe)
- Remove usage of file-based stores (no migration).
- Boot Postgres container.
- Run schema init.
- Restart backend with `DATABASE_URL`.

## Open Questions
- Do we want to keep `signals_latest` only, or also allow historical signals later?
- Should we store payloads as `JSONB` (preferred) or `BYTEA`?
