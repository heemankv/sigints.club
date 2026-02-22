# MVP Achievements (sigints.club)
Date: 2026-02-20

## Summary
We now have a working MVP across Solana programs, a Node/TS backend with hybrid encryption delivery, a feed-first social UI, and a usable SDK/MCP for agents. The system supports on-chain subscription NFTs, on-chain signal anchoring, Tapestry-powered social feeds (intents + slash reports), and a complete E2E test flow on localnet.

## Solana (On-Chain)
1. Programs deployed (devnet + localnet):
   - `subscription_royalty`: `BMDH241mpXx3WHuRjWp7DpBrjmKSBYhttBgnFZd5aHYE`
   - `stream_registry`: `5mDTkhRWcqVi4YNBqLudwMTC4imfHjuCtRu82mmDpSRi`
   - `challenge_slashing`: `DqQjh7bT9sri2fnZqh58nEpzeJb7jZaCNzb4CMGNqbEP`
2. `stream_registry` enforces stream + tier config:
   - `create_stream`, `update_stream`, `upsert_tier`.
   - Tier hash is derived from tier config and enforced in registry.
3. `subscription_royalty` enforces on-chain subscribe:
   - Validates stream status, tier status, price, pricing type, evidence level, and quota.
   - Validates maker authority and treasury (DAO) from the registry.
   - Splits fee: 1% platform fee + 99% maker payout.
   - Mints a 1-of-1 NFT (SPL mint, supply=1) to the subscriber’s wallet.
   - Tracks `stream_state.subscription_count`.
4. `record_signal` uses Solana Clock for `created_at` (time anchor).
5. Signal anchoring is **latest-only** (one on-chain account per stream).
6. On-chain signal record stores **hashes + pointer hashes** (not raw pointers).

## Backend (Node.js + TypeScript)
1. Hybrid encryption delivery is implemented:
   - ciphertext + keybox stored off-chain
   - signal metadata recorded on-chain
2. Pluggable storage interface, MVP uses file-based storage.
3. Tapestry-first social layer:
   - Intents, slash reports, likes, comments, follows.
   - Trending feed (likes-based) + following feed via Tapestry follow graph.
   - Comment pagination and like/comment counts returned with feed responses.
4. Signal + storage endpoints for SDK and UI:
   - `POST /signals`
   - `GET /signals?streamId=`
   - `GET /signals/latest?streamId=`
   - `GET /signals/by-hash/:hash`
   - `GET /storage/ciphertext/:sha`
   - `GET /storage/keybox/:sha?subscriberId=`
   - `GET /storage/public/:sha` (public signals)
5. Social endpoints:
   - `POST /social/intents`
   - `POST /social/slash`
   - `GET /social/feed?type=&scope=following&wallet=` (includes like/comment counts)
   - `GET /social/feed/trending?limit=`
   - `POST /social/likes` / `DELETE /social/likes`
   - `POST /social/comments` / `GET /social/comments?contentId=&page=&pageSize=`
   - `POST /social/follow`

## Frontend (Next.js)
1. Feed-first UI (Twitter/Reddit DNA):
   - Composer (Intent / Slash)
   - Filters: Following + Type (All/Intent/Slash)
   - Like/Comment/Follow actions
   - Trending rail + maker rail
2. Inline stream chips + subscribe modal from feed cards.
3. Stream page supports:
   - publish signal
   - decrypt signal
   - on-chain subscribe (wallet-signed)
4. Profile reads on-chain subscription NFTs.
5. Network onboarding modal + network indicator.
6. Loading shimmer for feed + comments.

## SDK + MCP
1. `@sigints/sdk`:
   - listen on-chain for `record_signal`
   - resolve backend pointers
   - decrypt signals
   - on-chain `createdAt` via SignalRecord
   - maxAge filtering
2. MCP server:
   - `check_stream_tick`
   - `listen_stream_ticks` (stream)
   - `stop_stream_ticks`

## Tests
1. Backend unit + integration tests pass.
2. E2E test suite passes on localnet (subscribe + NFT + record_signal + SDK + MCP).
3. Frontend build passes.

## Known Gaps (Next Steps)
1. On-chain records store hashes only; pointer resolution still requires backend or DA layer.
2. Slashing program is not fully wired into UI and social flows.
3. Tapestry social features require API key; without it, social + discovery are unavailable (no fallback).
