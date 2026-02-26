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

Optional:
- `ORBITFLARE_RPC_URL` (if you want to send the on‑chain tx via OrbitFlare)

## Listening (03 + 04) — Jetstream

Required:
- `SIGINTS_STREAM_PUBKEY`
- `ORBITFLARE_RPC_URL`
- `ORBITFLARE_JETSTREAM_ENDPOINT`
- `ORBITFLARE_API_KEY`
- `ORBITFLARE_API_KEY_HEADER`

Private streams only:
- `SIGINTS_SUBSCRIBER_PUBLIC_KEY_DER_BASE64`
- `SIGINTS_SUBSCRIBER_PRIVATE_KEY_DER_BASE64`

Optional:
- `SIGINTS_LISTEN_MS` (default 60000)

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
- `--rpc-url`

Listening (Jetstream):
- `--backend-url`
- `--stream-id`
- `--stream-pubkey`
- `--listen-ms`
- `--rpc-url`
- `--jetstream-endpoint`
- `--api-key`
- `--api-key-header`

Private listening only:
- `--subscriber-public-key`
- `--subscriber-private-key`
