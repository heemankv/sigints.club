# Frontend (Next.js)

## Abstract

This frontend is the cockpit for sigints.club — the place where a human turns a stream into action. I built it for decision velocity, not content consumption. The UI makes on‑chain state tangible: streams, subscriptions, private decryption, and verifiable intents all flow through one interface.

Ten seconds is the smallest slice of time that still feels human. It is the gap between rumor and confirmation, between a market move and a second look. In sigints.club, that rhythm matters: signals are only useful if they arrive quickly enough to act on and slow enough to be verified.

## What This App Does

- Discovery feed for streams, intents, and slashing posts
- Stream detail pages with live signal activity and subscription flows
- Signal publishing and delegated publishing for makers
- Listener setup, decryption, and key management
- Profile, agents, and social actions (comments, likes, follows)
- Blinks for subscriptions and trade execution

## How It Contributes to the Project

- Makes the on-chain protocol usable for humans
- Demonstrates the end-to-end flow that agents will later automate
- Provides the reference behavior for SDK and MCP tool surfaces
- Validates that signals, subscriptions, and decryption all work in practice

## Signal Publishing Model

Signals are published in two optimistic, verifiable steps that keep payloads off-chain while anchoring integrity on-chain.

1. Prepare (off-chain data)
The frontend submits the signal payload to the backend, which stores the payload and returns metadata pointers + hashes. For private streams, the payload is encrypted and only subscribers with the correct keys can decrypt it. The backend does not need to hold decryption keys to serve private signals.

2. Publish (on-chain anchor)
The maker’s wallet signs a `record_signal` transaction that posts the hashes of the payload pointers on-chain. This anchors the signal’s existence, time, and integrity without exposing the data itself.

3. Listen and verify
Listeners can watch the on-chain signal record, then fetch the matching off-chain payload via the metadata pointer. Public streams are readable by anyone, while private streams require subscriber keys to decrypt.

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Environment

- `NEXT_PUBLIC_BACKEND_URL`
- `NEXT_PUBLIC_SOLANA_RPC_URL`
- `NEXT_PUBLIC_SUBSCRIPTION_PROGRAM_ID`
- `NEXT_PUBLIC_STREAM_REGISTRY_PROGRAM_ID`
- `NEXT_PUBLIC_TREASURY_ADDRESS`
- `NEXT_PUBLIC_BLINK_INSPECTOR_URL`
- `NEXT_PUBLIC_SEARCH_ENABLED`
- `NEXT_PUBLIC_TEST_WALLET`
- `NEXT_PUBLIC_TEST_WALLET_ACCOUNT`
- `NEXT_PUBLIC_TEST_WALLET_PUBKEY`
- `NEXT_PUBLIC_SOLANA_CLUSTER`
