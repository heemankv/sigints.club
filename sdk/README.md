# @heemankv/sigints-sdk

A TypeScript SDK for building on sigints.club. It connects the Solana programs, the backend, and encrypted signal payloads into one consistent client API so you can build publishers, listeners, dashboards, or AI agents.

## Abstract

This SDK exists so signals can move at decision speed. I built it to let software do what the UI does: discover streams, subscribe, decrypt, and react without manual clicks. If the website is the cockpit, this SDK is the API surface that lets builders and agents fly the plane.

sigints.club is live data feeds, all on‑chain. Streams are registered on‑chain, subscriptions are minted on‑chain, and signals can be public or encrypted for subscribers only. The SDK makes this programmable and composable.

## Install

```bash
npm install @heemankv/sigints-sdk
```

## What You Can Build

- Stream explorers and dashboards
- Signal publishers (manual or automated)
- Listener bots that decrypt and react to signals
- Social flows (posts, comments, follows)
- Agent tooling or MCP servers
- Blink‑powered trade execution

## Quick Start: Listen for Signals

```ts
import { SigintsClient } from "@heemankv/sigints-sdk";

const client = await SigintsClient.fromBackend("https://your-backend");

const stop = await client.listenForSignals({
  streamPubkey: "STREAM_PDA",
  streamId: "stream-btc",
  onSignal: (signal) => {
    console.log("Signal:", signal.plaintext);
  },
});

// Later
// stop();
```

## Private Signals: Register Key + Decrypt

```ts
import { SigintsClient } from "@heemankv/sigints-sdk";

const client = await SigintsClient.fromBackend("https://your-backend");

// 1) Generate subscriber keys
const keys = SigintsClient.generateKeys();

// 2) Register the public key for the stream
await client.registerEncryptionKey("stream-btc", keys.publicKeyDerBase64, "YOUR_WALLET");

// 3) Fetch + decrypt the latest signal
const latest = await client.fetchLatestSignal("stream-btc");
const plaintext = await client.decryptSignal(latest, keys);
console.log(plaintext);
```

## On-Chain Transactions (Builder Example)

```ts
import { Connection, Keypair } from "@solana/web3.js";
import { buildSubscribeTransaction } from "@heemankv/sigints-sdk/transactions";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const wallet = Keypair.generate();

const { transaction, latestBlockhash } = await buildSubscribeTransaction({
  connection,
  programId: "SUBSCRIPTION_PROGRAM_ID",
  streamRegistryProgramId: "STREAM_REGISTRY_PROGRAM_ID",
  stream: "STREAM_PDA",
  subscriber: wallet.publicKey,
  tierId: "trust",
  pricingType: 1,
  evidenceLevel: 0,
  expiresAtMs: Date.now() + 30 * 24 * 60 * 60 * 1000,
  quotaRemaining: 100,
  priceLamports: 0,
  maker: "MAKER_WALLET",
  treasury: "TREASURY_WALLET",
});

transaction.sign(wallet);
const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false });
await connection.confirmTransaction({ signature, ...latestBlockhash }, "confirmed");
```

## SDK Surfaces (Subpath Imports)

- `@heemankv/sigints-sdk` for `SigintsClient`
- `@heemankv/sigints-sdk/backend` for REST helpers
- `@heemankv/sigints-sdk/transactions` for on‑chain transaction builders
- `@heemankv/sigints-sdk/publish` for signal publishing helpers
- `@heemankv/sigints-sdk/solana` for program‑level helpers
- `@heemankv/sigints-sdk/tradeIntent` for trade intent parsing and Blink URLs
- `@heemankv/sigints-sdk/crypto` for X25519 keygen + decryption helpers

## Backend Client Helpers (Examples)

```ts
import { createBackendClient } from "@heemankv/sigints-sdk/backend";

const backend = createBackendClient("https://your-backend");
const streams = await backend.fetchStreams(true);
const feed = await backend.fetchFeed("intent");
```

## Notes

- Public signal payloads still require an active subscription NFT.
- Private streams require a registered encryption key and keybox entry.
- Jetstream is Node-only; browser listeners use WebSocket.
