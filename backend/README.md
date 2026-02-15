# Backend (MVP)

## Purpose
Minimal backend for Persona.fun MVP. Handles ciphertext/keybox storage, signal metadata, and integration glue.

## Storage Providers
This backend uses a pluggable StorageProvider interface so we can switch from backend storage to a DA layer without changing the rest of the code.

- BackendStorage: MVP default
- DAStorage: placeholder for future DA integration

## Integration Tests
Integration tests live in `backend/tests/integration` and should cover:
1. Storing and fetching ciphertext and keyboxes.
2. Hash verification.
3. End-to-end signal delivery flow.

## Agent Scripts
- `npm run provider`: registers subscribers and publishes a demo signal.
- `npm run listener`: decrypts the latest signal for a given subscriber.
- `npm run tapestry:profile`: create or find a Tapestry profile.
- `npm run tapestry:content`: post a Tapestry content item (signal or request).
- `npm run tapestry:follow`: follow a profile in Tapestry.
- `npm run personas:create`: create persona PDAs on-chain and write `SOLANA_PERSONA_MAP`.

## Tapestry Env Vars
- `TAPESTRY_API_KEY`
- `TAPESTRY_BASE_URL` (optional, defaults to https://api.usetapestry.dev/v1/)
- `TAPESTRY_PROFILE_ID` (default profile for publishing signals)
- `TAPESTRY_PROFILE_MAP` (JSON map: personaId -> profileId)

## Solana Env Vars (On-chain record_signal)
When these are set, the backend sends a real Anchor transaction to record signals.

- `SOLANA_SUBSCRIPTION_PROGRAM_ID` (required to enable on-chain)
- `SOLANA_KEYPAIR` (path to payer keypair JSON) OR `SOLANA_PRIVATE_KEY` (base58 secret key)
- `SOLANA_RPC_URL` (optional, defaults to https://api.devnet.solana.com)
- `SOLANA_PERSONA_REGISTRY_PROGRAM_ID` (required for persona PDA creation)

## On-chain subscription endpoints
- `POST /subscribe/onchain` create subscription PDA and store tier params on-chain
- `POST /subscribe/onchain/renew` renew subscription
- `POST /subscribe/onchain/cancel` cancel subscription

## Social profile endpoints
- `POST /users/login` register wallet-based profile
- `GET /users/:wallet` fetch profile
- `PATCH /users/:wallet` update profile
- `POST /bots` create maker/listener bot
- `GET /bots?owner=&role=&search=` list bots
- `POST /subscriptions` store off-chain subscription record
- `GET /subscriptions?listener=&botId=` list subscriptions
- `GET /feed` aggregate signal feed
- `SOLANA_IDL_PATH` (optional, defaults to `backend/idl/subscription_royalty.json`)
- `SOLANA_PERSONA_MAP` (optional JSON map: personaId -> persona account pubkey)
- `SOLANA_PERSONA_DEFAULT` (optional fallback persona pubkey)

## Persistence
- `PERSIST=true` enables file-based persistence for subscribers and signals (default for non-test).
