# Technical Low-Level Architecture (MVP)
Project: sigints.club
Date: 2026-02-20

## Purpose
Define the low-level technical choices and component interfaces for the MVP as implemented.

## Language and Stack
1. On-chain programs: Rust + Anchor.
2. Frontend: Next.js (React).
3. Backend + agents: Node.js + TypeScript.
4. Social layer: Tapestry via `socialfi` NPM package.

## Social Layer (Tapestry)
Tapestry manages the social graph off-chain with on-chain anchors. We use:
- Profiles (wallet identity)
- Content (intents + slash reports)
- Likes + comments (reputation)
- Follow graph (discovery + following feed)

Tapestry is mandatory for discovery and social interactions. The backend does not store social posts or provide fallback discovery.

## Datastores We Own (MVP)
1. **File-based storage** for ciphertext and keyboxes.
2. **JSON file stores** for minimal metadata (users, bots, subscriptions).

Note: This is intentionally minimal for hackathon speed. A DB can be plugged in later via the storage interfaces.

## On-Chain Programs (Anchor)
1. **Stream Registry**
   - `create_stream`, `update_stream`, `upsert_tier`.
   - Stores stream config + tier config, status, and tiers hash.

2. **Subscription + Royalty**
   - `subscribe`, `renew`, `cancel`.
   - Enforces tier config (price, monthly pricing, evidence level).
   - Enforces maker authority + treasury (DAO) from registry.
   - Splits fee: 1% platform fee + 99% maker payout.
   - Mints a 1-of-1 NFT to subscriber wallet.
   - `register_key` + `register_wallet_key` for encryption keys.
   - `record_signal` anchored with Solana Clock `created_at` (latest-only account).

3. **Challenge + Slashing**
   - Deployed but **not yet wired into UI**.

## PDA Accounts (Minimal)
1. StreamConfig PDA
   - `stream_id`, `authority`, `dao`, `tiers_hash`, `status`.
2. TierConfig PDA
   - `tier_id`, `pricing_type`, `price_lamports`, `evidence_level`, `quota`, `status`.
3. Subscription PDA
   - `subscriber`, `stream`, `tier_id`, `expires_at`, `quota_remaining`, `status`, `nft_mint`.
4. StreamState PDA
   - `subscription_count`, `bump`.
5. SignalRecord PDA
   - **SignalLatest PDA** (latest-only per stream)
   - `signal_hash`, `signal_pointer_hash`, `keybox_hash`, `keybox_pointer_hash`, `created_at`.

## Backend Services (Current)
1. **API Service**
   - Signals: `/signals`, `/signals/latest`, `/signals/by-hash/:hash`.
   - Storage: `/storage/ciphertext/:sha`, `/storage/keybox/:sha?subscriberId=`, `/storage/public/:sha`.
   - Social: `/social/*` for intents/slash, likes, comments, follows, feed, trending.

2. **Social Service (Tapestry)**
   - Uses Tapestry `listContents` and `listFollowing`.
   - Adds like/comment counts in responses.
   - Supports “Following” feed.

3. **On-chain recorder**
   - Records signal hashes + pointer hashes via `record_signal`.

## Frontend (Current)
- Feed-first UI with composer + filters + trending rail.
- Inline stream chips + subscription modal.
- Stream page: subscribe, publish signal, decrypt.
- Profile page: on-chain subscription NFTs.
- Network onboarding + indicator.

## Encryption Delivery (MVP)
- Encrypt signal once (symmetric key).
- Wrap symmetric key per subscriber.
- Store ciphertext + keybox off-chain.
- Public signals skip keybox and store plaintext payloads in `/storage/public`.
- On-chain stores hashes + pointer hashes only.

## MVP Data Flow
1. User posts intent/slash (Tapestry content).
2. Maker registers stream + tier on-chain.
3. Listener subscribes (on-chain NFT minted).
4. Maker publishes encrypted signal.
5. Backend stores ciphertext + keybox, records on-chain hashes.
6. Listener (SDK/MCP) decrypts and triggers action.

## What We Are Not Building (MVP)
- Slashing arbitration UI + on-chain enforcement.
- Full DB indexing or ranking engine.
- On-chain storage of pointers (hashes only).
