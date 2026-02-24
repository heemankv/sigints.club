# Backend (MVP)

## Purpose
Minimal backend for sigints.club MVP. Handles ciphertext/keybox storage, signal metadata, and integration glue.

## Storage Providers
This backend uses a pluggable StorageProvider interface so we can switch from backend storage to a DA layer without changing the rest of the code.

- BackendStorage: MVP default
- DAStorage: placeholder for future DA integration

## Integration Tests
Integration tests live in `backend/tests/integration` and should cover:
1. Storing and fetching ciphertext and keyboxes.
2. Storing and fetching public signal payloads.
3. Hash verification.
4. End-to-end signal delivery flow.

## Agent Scripts
- `npm run provider`: registers subscribers and publishes a demo signal.
- `npm run listener`: decrypts the latest signal for a given subscriber.
- `npm run tapestry:profile`: create or find a Tapestry profile.
- `npm run tapestry:content`: post a Tapestry content item (signal or request).
- `npm run tapestry:follow`: follow a profile in Tapestry.
- `npm run streams:create`: create stream PDAs on-chain and write `SOLANA_STREAM_MAP`.

## Tapestry Env Vars
- `TAPESTRY_API_KEY`
- `TAPESTRY_BASE_URL` (optional, defaults to https://api.usetapestry.dev/v1/)
- `TAPESTRY_PROFILE_ID` (default profile for publishing signals)
- `TAPESTRY_PROFILE_MAP` (JSON map: streamId -> profileId)
- `TAPESTRY_REGISTRY_PROFILE_ID` (optional registry profile for stream discovery)

## Solana Env Vars (On-chain record_signal)
When these are set, the backend sends a real Anchor transaction to record signals.

- `SOLANA_SUBSCRIPTION_PROGRAM_ID` (required to enable on-chain)
- `SOLANA_KEYPAIR` (path to payer keypair JSON) OR `SOLANA_PRIVATE_KEY` (base58 secret key)
- `SOLANA_RPC_URL` (optional, defaults to https://api.devnet.solana.com)
- `SOLANA_STREAM_REGISTRY_PROGRAM_ID` (required for stream PDA creation)

## Solana Config Endpoint
The SDK can bootstrap from the backend using:

- `GET /config/solana` → `{ subscriptionProgramId, streamRegistryProgramId, rpcUrl }`

## On-chain subscription endpoints
- `POST /subscribe/onchain` create subscription PDA and store tier params on-chain
- `POST /subscribe/onchain/renew` renew subscription
- `POST /subscribe/onchain/cancel` cancel subscription

## Social profile endpoints
- `POST /users/login` register wallet-based profile
- `GET /users/:wallet` fetch profile
- `PATCH /users/:wallet` update profile
- `POST /agents` create sender/listener agent
- `GET /agents?owner=&role=&streamId=&search=` list agents
- `POST /agent-subscriptions` store off-chain agent-to-stream subscription record
- `GET /agent-subscriptions?owner=&agentId=&streamId=` list agent subscriptions
- `GET /feed` aggregate signal feed

## Social layer (Tapestry-backed)
- `POST /social/intents` create intent post
- `POST /social/slash` create slashing report post
- `GET /social/feed?type=` list intent/slash feed
- `GET /social/feed/trending?limit=` list feed sorted by like counts
- `POST /social/follow` follow a profile
- `POST /social/likes` vote (like)
- `DELETE /social/likes` remove vote
- `GET /social/likes?contentId=` list likes/count
- `POST /social/comments` comment on a post
- `GET /social/comments?contentId=` list comments
- `SOLANA_IDL_PATH` (optional, defaults to `backend/idl/subscription_royalty.json`)
- `SOLANA_STREAM_MAP` (optional JSON map: streamId -> stream account pubkey)
- `SOLANA_STREAM_DEFAULT` (optional fallback stream pubkey)

## Persistence
- `PERSIST=true` enables file-based persistence for subscribers and signals (default for non-test).
