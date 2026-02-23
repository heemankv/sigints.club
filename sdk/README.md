# SDK (@sigints/sdk)

Minimal agent SDK to listen for sigints.club signals, resolve backend pointers, and decrypt.

## Install (local dev)
```bash
cd /Users/heemankverma/Work/graveyard/sdk
npm install
npm run build
```

## Usage
```ts
import { SigintsClient } from "@sigints/sdk";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";

const wallet = Keypair.generate();
const client = await SigintsClient.fromBackend("http://localhost:3001", {
  keyboxAuth: {
    walletPubkey: wallet.publicKey.toBase58(),
    signMessage: (message) => nacl.sign.detached(message, wallet.secretKey),
  },
});

const keys = SigintsClient.generateKeys();
const subscriberId = await client.registerEncryptionKey(
  "stream-eth",
  keys.publicKeyDerBase64,
  "SUBSCRIBER_WALLET_PUBKEY"
);

const stop = await client.listenForSignals({
  streamId: "stream-eth",
  streamPubkey: "STREAM_ONCHAIN_PUBKEY",
  subscriberKeys: {
    publicKeyDerBase64: keys.publicKeyDerBase64,
    privateKeyDerBase64: keys.privateKeyDerBase64,
  },
  onSignal: (signal) => {
    console.log("New signal", signal.signalHash, signal.plaintext);
  },
  maxAgeMs: 60_000,
  includeBlockTime: true,
});
```

If you want to pass config manually instead of bootstrapping from the backend:
```ts
const client = new SigintsClient({
  rpcUrl: "http://127.0.0.1:8899",
  backendUrl: "http://localhost:3001",
  programId: "BMDH241mpXx3WHuRjWp7DpBrjmKSBYhttBgnFZd5aHYE",
  streamRegistryProgramId: "HCm2Bk65hCaevrs4N3oYegMBZBTPpzjoMB44JgTrTVSA",
  keyboxAuth: {
    walletPubkey: wallet.publicKey.toBase58(),
    signMessage: (message) => nacl.sign.detached(message, wallet.secretKey),
  },
});
```

## Backend Client (No Frontend Dependencies)
If you only need backend calls (streams, feed, storage, test wallet), use the backend client.

```ts
import { createBackendClient } from "@sigints/sdk";

const backend = createBackendClient("http://localhost:3001");

const { streams } = await backend.fetchStreams(true);
const { signal } = await backend.fetchLatestSignal("stream-eth");
const { payload } = await backend.fetchPublicPayload("PUBLIC_SHA");
```

This keeps the SDK environment‑agnostic: the caller supplies the backend URL at startup
and the SDK does not assume any frontend globals.

### Public streams
If a stream is public, `subscriberKeys` are optional. The SDK will fetch the plaintext payload directly from `/storage/public`.

### Private streams (keybox auth)
Private streams require `keyboxAuth` so the backend can verify NFT ownership before returning keybox entries.

## Notes
- Signals are discovered on-chain via program account changes.
- Ciphertext and keybox are fetched from the backend using pointer hashes.
