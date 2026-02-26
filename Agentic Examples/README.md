# Agentic Examples

Small, focused scripts that show how JavaScript can use the sigints SDK to interact with sigints.club.

## Setup

```bash
cd "Agentic Examples"
npm install
```

## Environment

- `SIGINTS_BACKEND_URL` (defaults to http://127.0.0.1:3001)
- `SIGINTS_STREAM_ID` (used by Jetstream listener)
- `SIGINTS_STREAM_PUBKEY` (used by Jetstream listener)
- `ORBITFLARE_RPC_URL`
- `ORBITFLARE_JETSTREAM_ENDPOINT`
- `ORBITFLARE_API_KEY`
- `ORBITFLARE_API_KEY_HEADER`
- `SIGINTS_SUBSCRIBER_PUBLIC_KEY_DER_BASE64` (optional, for private stream decrypt)
- `SIGINTS_SUBSCRIBER_PRIVATE_KEY_DER_BASE64` (optional, for private stream decrypt)
- `SIGINTS_LISTEN_MS` (optional, default 60000)
- `SIGINTS_WALLET` (optional, enables profile + intent example)
- `SIGINTS_ALLOW_WRITE` (optional, set to true to enable writes)
- `SIGINTS_USER_WALLET` (optional, used by simple query example)

## Examples

1. `01-website-interaction.mjs`
2. `02-jetstream-listen.mjs`
3. `03-simple-query.mjs`

Run an example:

```bash
node "Agentic Examples/01-website-interaction.mjs"
```

