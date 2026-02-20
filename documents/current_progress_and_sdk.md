Below is a **current, concrete summary** of what works right now, plus the **SDK/MCP surface** that agents can use today. I also call out **real limitations** so expectations are clear.

---

## What works end-to-end (today)
1. **Wallet login** in UI (Phantom/Solflare).  
2. **Feed-first social UI** with:
   - Intent + Slash composer
   - Following + Type filters
   - Like, Comment, Follow
   - Trending + maker rails
   - Shimmer loading states
3. **Tapestry social integration** (profiles, posts, likes, comments, follows).  
4. **On-chain persona + tier registry** (persona_registry program).  
5. **On-chain subscription NFT** minted to subscriber wallet, with **price + tier enforcement**.  
6. **On-chain fee split** (1% platform fee + maker payout).  
7. **Hybrid encryption delivery** (ciphertext + keybox off-chain).  
8. **On-chain record_signal** with Clock-based `createdAt`.  
9. **SDK + MCP** for agent listening and decryption.  
10. **Localnet E2E tests pass** (subscribe, NFT mint, record_signal, SDK + MCP streaming).  

---

## Current limitations (explicit)
1. **On-chain only stores hashes** (signal_hash + pointer_hash). Agents still need backend/DA to resolve pointers.  
2. **Tapestry is required for social feeds**; no API key = social feed disabled.  
3. **Following feed depends on Tapestry follow graph** and may be eventually consistent.  
4. **Slashing program is not fully wired to UI** (slash posts exist, on-chain challenge flow pending).  

---

## How AI agents can subscribe to ticks (today)
There are three viable paths:

1. **On-chain logs (best integrity)**  
   - Listen to `subscription_royalty` for `record_signal` PDA changes.  
   - Fetch `SignalRecord` to get `createdAt` and hashes.  
   - Resolve ciphertext/keybox pointers via backend storage.  

2. **Backend signals feed (simplest)**  
   - `GET /signals/latest?personaId=...`  
   - `GET /signals?personaId=...`  
   - Use signal metadata to resolve ciphertext/keybox.  

3. **Tapestry feed (social context)**  
   - Use Tapestry posts for intents/slash reports.  
   - This is the discovery layer, not the signal delivery layer.  

---

## SDK (current API surface)
Package: `@personafun/sdk`

**Key API:**
- `PersonaClient.generateKeys()`
- `registerEncryptionKey(personaId, publicKeyDerBase64, subscriberWallet)`
- `fetchLatestSignal(personaId)` / `fetchSignalByHash(signalHash)`
- `decryptSignal(meta, keys)`
- `listenForSignals({ personaPubkey, personaId, subscriberKeys, maxAgeMs, includeBlockTime, onSignal })`
- `fetchSignalRecordCreatedAt(personaPubkey, signalHash)`

**Example (agent)**
```ts
import { PersonaClient } from "@personafun/sdk";

const client = new PersonaClient({
  rpcUrl: "http://127.0.0.1:8899",
  backendUrl: "http://localhost:3001",
  programId: "BMDH241mpXx3WHuRjWp7DpBrjmKSBYhttBgnFZd5aHYE",
});

const keys = PersonaClient.generateKeys();
await client.registerEncryptionKey("persona-eth", keys.publicKeyDerBase64, subscriberWallet);

const stop = await client.listenForSignals({
  personaId: "persona-eth",
  personaPubkey: personaPda,
  subscriberKeys: keys,
  maxAgeMs: 60_000,
  includeBlockTime: true,
  onSignal: (tick) => {
    console.log("Signal:", tick.plaintext, "age", tick.ageMs);
  },
});

// later: stop();
```

---

## MCP Server (current tools)
- `check_persona_tick` → checks the latest signal, decrypts it, returns JSON text.  
- `listen_persona_ticks` → long-running stream; emits notifications with decrypted ticks.  
- `stop_persona_ticks` → stops a stream by ID.  

---

## Open Questions (optional, for later)
1. Should SDK enforce subscription NFT ownership before decrypting?  
2. Should we push pointer resolution to a DA layer instead of backend?  
3. Should Tapestry become mandatory for all discovery and feed views (v2)?  

---

## Mini check (quick exercise)
1. If a tick is old (90s) and `maxAgeMs=60s`, what should the SDK do?  
2. Why can’t on-chain alone deliver ciphertext?  
3. What breaks if you only read the social feed but never check `record_signal`?  
