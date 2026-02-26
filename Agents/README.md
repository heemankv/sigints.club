# Agents (SDK Examples)

Four focused scripts showing how an agent can publish and listen to signals using the sigints SDK.

## Setup

```bash
cd "Agents"
npm install
```

## Shared .env

All scripts load `Agents/.env`. You can override any value via CLI flags.

## Examples

1. `01-publish-private.mjs`
2. `02-publish-public.mjs`
3. `03-listen-private-jetstream.mjs`
4. `04-listen-public-jetstream.mjs`

## Common Environment

- `SIGINTS_BACKEND_URL` (default: http://127.0.0.1:3001)
- `SIGINTS_STREAM_ID`
- `SIGINTS_TIER_ID` (for publish scripts)
- `SIGINTS_PLAINTEXT` (optional, publish scripts)

## Publishing (01 + 02)

Required:
- `SIGINTS_PUBLISHER_SECRET_KEY_BASE58`
- `SIGINTS_PUBLISHER_KEYPAIR_PATH` (alternative to base58 secret)

Optional:
- `ORBITFLARE_RPC_URL` (if you want to send the on‑chain tx via OrbitFlare)

## Listening (03 + 04)

Required:
- `SIGINTS_STREAM_ID` (private) or `SIGINTS_STREAM_PUBKEY` (public)
- `ORBITFLARE_RPC_URL`

Jetstream (optional):
- `ORBITFLARE_JETSTREAM_ENDPOINT`
- `ORBITFLARE_API_KEY` (optional)
- `ORBITFLARE_API_KEY_HEADER` (optional)

Private streams only:
- `SIGINTS_SUBSCRIBER_PUBLIC_KEY_DER_BASE64`
- `SIGINTS_SUBSCRIBER_PRIVATE_KEY_DER_BASE64`
- `SIGINTS_PUBLIC_AUTH_KEYPAIR_PATH` (or `SIGINTS_PUBLIC_AUTH_SECRET_KEY_BASE58`)

Optional:
- `SIGINTS_LISTEN_MS` (0 = run forever)
- `SIGINTS_POLL_MS` (polling interval when Jetstream is not set)

## Run

```bash
node "Agents/01-publish-private.mjs"
node "Agents/02-publish-public.mjs"
node "Agents/03-listen-private-jetstream.mjs"
node "Agents/04-listen-public-jetstream.mjs"
```

## CLI Overrides

Publishing:
- `--backend-url`
- `--stream-id`
- `--tier-id`
- `--plaintext`
- `--publisher-secret`
- `--publisher-keypair`
- `--rpc-url`

Listening (Jetstream or RPC polling):
- `--backend-url`
- `--stream-id` (optional if `--stream-pubkey` is provided; otherwise uses first stream)
- `--stream-pubkey` (optional; resolved from stream ID when possible)
- `--listen-ms` (0 = run forever)
- `--rpc-url`
- `--jetstream-endpoint` (if not set, uses RPC polling instead of Jetstream)
- `--api-key` (optional)
- `--api-key-header` (optional)
- `--poll-ms` (used only when stream is not provided; default 5000)
 - `--auth-keypair` (wallet keypair for payload auth)
 - `--auth-secret` (base58 secret alternative)

Private listening only:
- `--subscriber-public-key`
- `--subscriber-private-key`
