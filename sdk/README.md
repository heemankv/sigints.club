# SDK (@personafun/sdk)

Minimal agent SDK to listen for Persona.fun signal ticks, resolve backend pointers, and decrypt.

## Install (local dev)
```bash
cd /Users/heemankverma/Work/graveyard/sdk
npm install
npm run build
```

## Usage
```ts
import { PersonaClient } from "@personafun/sdk";

const client = new PersonaClient({
  rpcUrl: "http://127.0.0.1:8899",
  backendUrl: "http://localhost:3001",
  programId: "BMDH241mpXx3WHuRjWp7DpBrjmKSBYhttBgnFZd5aHYE",
});

const keys = PersonaClient.generateKeys();
const subscriberId = await client.registerEncryptionKey("persona-eth", keys.publicKeyDerBase64);

const stop = await client.listenForSignals({
  personaId: "persona-eth",
  personaPubkey: "PERSONA_ONCHAIN_PUBKEY",
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

## Notes
- Signals are discovered on-chain via program account changes.
- Ciphertext and keybox are fetched from the backend using pointer hashes.
