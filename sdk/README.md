# sigints.club SDK

A TypeScript SDK for building on sigints.club. It covers:
- Solana on-chain transactions and instruction builders
- Backend API helpers
- Signal encryption/decryption
- Real-time listening (WebSocket or OrbitFlare Jetstream)
- Trade intent parsing utilities

## Install

```bash
npm install @heemankv/sigints-sdk
```

## Quick Start (Backend-Backed Client)

```ts
import { SigintsClient } from "@heemankv/sigints-sdk";

const client = await SigintsClient.fromBackend("https://your-backend");

const stop = await client.listenForSignals({
  streamPubkey: "YOUR_STREAM_PDA",
  streamId: "stream-btc",
  onSignal: (signal) => {
    console.log("Signal:", signal.plaintext);
  },
});
```

## Configuration

### StreamSdkConfig

```ts
import { SigintsClient } from "@heemankv/sigints-sdk";

const client = new SigintsClient({
  rpcUrl: "https://api.devnet.solana.com",
  backendUrl: "https://your-backend",
  programId: "SUBSCRIPTION_PROGRAM_ID",
  streamRegistryProgramId: "STREAM_REGISTRY_PROGRAM_ID",
});
```

### OrbitFlare (RPC + Jetstream)

```ts
import { SigintsClient } from "@heemankv/sigints-sdk";

const client = new SigintsClient({
  rpcUrl: "https://api.devnet.solana.com",
  backendUrl: "https://your-backend",
  programId: "SUBSCRIPTION_PROGRAM_ID",
  streamRegistryProgramId: "STREAM_REGISTRY_PROGRAM_ID",
  orbitflare: {
    rpcUrl: "https://your-orbitflare-devnet-rpc",
    jetstreamEndpoint: "https://your-jetstream-endpoint",
    apiKey: "ORBITFLARE_KEY",
    apiKeyHeader: "X-ORBIT-KEY",
  },
});
```

Behavior:
- If `orbitflare.rpcUrl` is provided, it overrides the RPC URL for all on-chain reads/writes.
- If `orbitflare.jetstreamEndpoint` is provided, `listenForSignals()` uses Jetstream.
- If Jetstream fails to connect, the SDK falls back to WebSocket subscriptions.
- If neither is configured, the SDK behaves as it does today.

Note: Jetstream is Node-only (not supported in browser runtimes).

## SigintsClient API

### Subscription + Keys
- `registerSubscription(streamId, subscriberWallet)`
- `registerEncryptionKey(streamId, publicKeyDerBase64, subscriberWallet)`
- `syncWalletKey(wallet, streamId, encPubKeyDerBase64?)`

### Streams
- `fetchStream(streamId)`

### Signals
- `fetchLatestSignal(streamId)`
- `fetchSignalByHash(signalHash)`
- `fetchCiphertext(pointer)`
- `fetchPublic(pointer)`
- `fetchKeyboxEntry(pointer, encPubKeyDerBase64)`
- `decryptSignal(metadata, keys)`

### Real-Time Listening
- `listenForSignals(options)`

Options:
- `streamPubkey`
- `streamId`
- `subscriberKeys` (for private streams)
- `onSignal`
- `onError`
- `maxAgeMs`
- `includeBlockTime`
- `transport` (`auto` | `jetstream` | `websocket`)

### Signal Publish
- `prepareSignal(input)`
- `buildRecordSignalInstruction(params)`
- `buildRecordSignalDelegatedInstruction(params)`

## Backend Client Helpers

The SDK also exports a backend client for direct REST calls.

### Core Client
- `createBackendClient(backendUrl)`

### Stream Discovery
- `fetchStream(streamId)`
- `fetchStreams(includeTiers?)`
- `fetchStreamSubscribers(streamId)`

### Subscriptions
- `registerSubscription({ streamId, subscriberWallet })`
- `fetchOnchainSubscriptions(subscriber, opts?)`

### Signals
- `fetchSignals(streamId)`
- `fetchSignalEvents({ streamId, limit, after })`
- `fetchLatestSignal(streamId)`
- `fetchSignalByHash(signalHash)`
- `prepareSignal({ streamId, tierId, plaintext, visibility? })`

### Payloads
- `fetchCiphertext(sha)`
- `fetchPublicPayload(sha, auth)`
- `fetchKeyboxEntry(sha, params)`

### Social Feed
- `fetchFeed(type?)`
- `fetchFollowingFeed(wallet, type?)`
- `fetchTrendingFeed(limit?)`
- `fetchPost(contentId)`
- `createIntent({ wallet, content, topic?, tags? })`
- `createSlashReport({ wallet, content, streamId?, makerWallet?, challengeTx? })`
- `addLike(wallet, contentId)`
- `removeLike(wallet, contentId)`
- `fetchLikeCount(contentId)`
- `fetchComments(contentId, page?, pageSize?)`
- `addComment(wallet, contentId, comment)`
- `deleteComment(wallet, commentId)`
- `followProfile(wallet, targetProfileId)`
- `deletePost(wallet, contentId)`

### Agents
- `searchAgents(params)`
- `fetchAgents(params)`
- `createAgent(payload)`
- `createAgentSubscription(payload)`
- `fetchAgentSubscriptions(params)`
- `deleteAgentSubscription(payload)`

### Auth / Profiles
- `fetchUserProfile(wallet)`
- `loginUser(params)`

### Test Utilities
- `getTestWallet(walletName?)`
- `testWalletSend({ transactionBase64, skipPreflight? }, walletName?)`
- `testWalletSignMessage({ messageBase64 }, walletName?)`

## Solana Transaction Builders

These helpers return a `Transaction` plus a fresh blockhash.

- `buildCreateStreamTransaction`
- `buildUpsertTiersTransaction`
- `buildSubscribeTransaction`
- `buildRegisterSubscriptionKeyTransaction`
- `buildRecordSignalTransaction`
- `buildRecordSignalDelegatedTransaction`
- `buildGrantPublisherTransaction`
- `buildRevokePublisherTransaction`

## Trade Intent Utilities

Parse the strict trade template and build a Blink URL.

```ts
import { parseTradeIntent, buildTradeActionUrl, buildTradeBlinkUrl } from "@heemankv/sigints-sdk";

const intent = parseTradeIntent(
  "TRADE: provider=Jupiter input=SOL amount=1.25 output=USDC slippageBps=50"
);

if (intent) {
  const actionUrl = buildTradeActionUrl(intent, "https://your-backend");
  const blinkUrl = buildTradeBlinkUrl(actionUrl, "https://your-app");
  console.log(blinkUrl);
}
```

## Notes

- Public signals still require an active subscription NFT to fetch payloads.
- Private signals require a registered key and keybox entry.
- Jetstream is only used for listening; all reads/writes still use RPC.
