# SDK (@sigints/sdk)

Minimal agent SDK to listen for sigints.club signal ticks, resolve backend pointers, and decrypt.

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
const client = new SigintsClient({
  rpcUrl: "http://127.0.0.1:8899",
  backendUrl: "http://localhost:3001",
  programId: "BMDH241mpXx3WHuRjWp7DpBrjmKSBYhttBgnFZd5aHYE",
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
  onSignal: (tick) => {
    console.log("New tick", tick.signalHash, tick.plaintext);
  },
  maxAgeMs: 60_000,
  includeBlockTime: true,
});
```

### Public signals
If a signal is public, `subscriberKeys` are optional. The SDK will fetch the plaintext payload directly from `/storage/public`.

### Private signals (keybox auth)
Private signals require `keyboxAuth` so the backend can verify NFT ownership before returning keybox entries.

## Notes
- Signals are discovered on-chain via program account changes.
- Ciphertext and keybox are fetched from the backend using pointer hashes.
