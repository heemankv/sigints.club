# MVP Achievements (Persona.fun)
Date: 2026-02-15

## Summary
We have a working MVP across Solana on-chain programs, a Node/TS backend with hybrid encryption delivery, and a Next.js frontend styled to match the introduction site. The system supports maker/listener bots, subscriptions, signal publishing, and optional Tapestry social posting.

## Solana (On-Chain)
1. Deployed three programs to devnet.
2. Implemented real on-chain `record_signal` via Anchor client (backend).
3. Implemented on-chain subscription flows (subscribe, renew, cancel) via Anchor client (backend).
4. Created persona PDAs and stored them in `SOLANA_PERSONA_MAP`.
5. Subscription now mints a 1-of-1 SPL token (NFT-like) per subscriber, stored on-chain.
6. Wallet-signed on-chain subscribe flow implemented in the frontend (no backend signer).

Program IDs (devnet):
1. `subscription_royalty`: `BMDH241mpXx3WHuRjWp7DpBrjmKSBYhttBgnFZd5aHYE`
2. `persona_registry`: `5mDTkhRWcqVi4YNBqLudwMTC4imfHjuCtRu82mmDpSRi`
3. `challenge_slashing`: `DqQjh7bT9sri2fnZqh58nEpzeJb7jZaCNzb4CMGNqbEP`

## Backend (Node.js + TypeScript)
1. Hybrid encryption delivery implemented and tested.
2. Pluggable storage interface with backend file storage as MVP.
3. Signal metadata storage and feed aggregation.
4. On-chain `record_signal` integration enabled when Solana env vars exist.
5. On-chain subscription endpoints added.
6. Social profile stores added for users, bots, and subscriptions.
7. Tapestry integration added via SocialFi client.
8. Added storage endpoints for SDK (signal lookup by hash, keybox/ciphertext retrieval).

Key backend endpoints:
1. `POST /signals` publish signal (hybrid encryption + on-chain record).
2. `GET /signals?personaId=` list signals for persona.
3. `GET /feed` aggregated feed of signals.
4. `POST /users/login` wallet-based profile registration.
5. `GET /users/:wallet` fetch user profile.
6. `PATCH /users/:wallet` update user profile.
7. `POST /bots` create maker/listener bot.
8. `GET /bots?owner=&role=&search=` list bots.
9. `POST /subscriptions` store subscription record.
10. `GET /subscriptions?listener=&botId=` list subscriptions.
11. `POST /subscribe/onchain` create on-chain subscription.
12. `POST /subscribe/onchain/renew` renew.
13. `POST /subscribe/onchain/cancel` cancel.

## Frontend (Next.js)
1. UI restyled to match the introduction website design system.
2. Wallet login with Phantom/Solflare on Solana devnet.
3. Discovery, Requests, Signals, Feed, Profile pages implemented.
4. Profile page shows maker bots, listener bots, and subscriptions.
5. Persona detail page supports subscribe, publish signal, and decrypt flow.
6. Search bar wired to bot search on the feed page.
7. Profile page now pulls on-chain subscriptions and shows the subscription NFT mint.
8. Wallet-signed on-chain subscribe flow exposed in UI.

## SDK + MCP
1. `@personafun/sdk` added to listen for ticks, resolve backend pointers, and decrypt signals.
2. MCP server added to expose a `check_persona_tick` tool for AI agents.

## Tapestry Integration
1. Backend Tapestry client added (profiles, content, follow).
2. Signals optionally post to Tapestry when API keys are configured.
3. CLI scripts available to create profiles and content.

## Tests
1. Backend integration tests for storage, encryption, and signal flow are present and passing.

## Environment and Ops
1. Backend env config supports Solana devnet and Tapestry API.
2. `SOLANA_PERSONA_MAP` in `.env` maps persona IDs to PDAs.
3. Frontend defaults to backend on `http://localhost:3001`.

## Known Gaps (Next Steps)
1. Finalize on-chain account layouts and tier defaults.
2. Add wallet-signed subscriptions from the frontend (no backend signing).
3. Pull live Tapestry feed into the UI.
4. Automate Tapestry profile creation on wallet login.
