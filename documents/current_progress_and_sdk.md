Below is a **complete, concrete summary** of what works right now, plus a **clean SDK design** for agent subscriptions and event listening. I’ll also call out the **current limitations** so expectations are clear.

---

**What a user can do right now (working end‑to‑end)**  
1. **Connect wallet** (Phantom/Solflare) in the UI.  
2. **Register a profile** (auto on login via backend).  
3. **Create bots** (maker or listener) with domain + evidence type.  
4. **Browse discovery + requests + signals** (backend-backed + fallback).  
5. **Subscribe off‑chain** by registering an **encryption public key** for a persona.  
6. **Publish signals** (hybrid encryption; ciphertext + keybox stored; metadata logged on‑chain).  
7. **Decrypt signals client‑side** using the user’s private key.  
8. **On‑chain record_signal** is live (Anchor client).  
9. **Subscription NFTs** are minted on‑chain per subscription and shown in the profile, **if the subscription is signed by that wallet** (see limitation below).  
10. **Localnet deployments** are confirmed working.

---

**Critical limitations (so it’s crystal‑clear)**  
1. **On‑chain subscribe uses backend wallet**, not the user’s wallet.  
   - That means the NFT is minted to the backend wallet, not the user.  
   - UI now reads subscriptions from **user’s wallet**, so it may show nothing if user didn’t sign the on‑chain tx.  
   - Fix: move on‑chain subscribe to frontend wallet‑signed flow.  
2. **On‑chain record_signal stores hashes + pointer hash**, not the pointer itself.  
   - So agents still need **backend or storage index** to resolve the pointer.  
3. **Tapestry** is optional today. We’ve wired it, but it’s not required for core flows.

---

**How AI agents can subscribe to events (today)**  
There are **three viable ways**:

1. **On‑chain logs (best for integrity)**  
   - Listen to `subscription_royalty` program logs, detect `record_signal`.  
   - Decode instruction or fetch the `SignalRecord` PDA.  
   - Use the **signal hash** to resolve the **ciphertext pointer** from storage/index.  
   - Fetch keybox, decrypt with your private key.

2. **Backend feed (simplest)**  
   - Poll `GET /signals?personaId=...` or `GET /feed`.  
   - This already includes the pointers.

3. **Tapestry feed (social layer)**  
   - Subscribe to Tapestry content stream (when mandatory in v2).

---

**Does an SDK make sense?**  
Yes — strongly. It hides complexity and gives agents a clean “subscribe + listen + decrypt” workflow.  
But **it must still rely on a pointer resolver** (backend or storage index), because the chain does not store pointers directly.

---

**SDK design (minimal, clean, works today)**  
Package: `@personafun/sdk`  

**Core primitives**
1. `createClient({ rpcUrl, programIds, backendUrl, storageUrl })`
2. `registerEncryptionKey(personaId, pubKeyBase64, subscriberWallet)`  
3. `subscribeOnChain(personaId, tierId, pricingType, evidenceLevel, quota?)`
4. `listenSignals({ personaId, onSignal })`  
   - Uses logs or polling
5. `fetchSignal(signalHash)`  
   - Resolves ciphertext + keybox pointer
6. `decryptSignal({ ciphertext, keybox, privateKey })`

**Example usage (agent side)**
```ts
import { createClient } from "@personafun/sdk";

const client = createClient({
  rpcUrl: "http://127.0.0.1:8899",
  programIds: { subscription: "BMDH..." },
  backendUrl: "http://localhost:3001",
});

const keys = client.crypto.generateKeypair();

await client.registerEncryptionKey("persona-eth", keys.publicKeyBase64, subscriberWallet);

await client.subscribeOnChain({
  personaId: "persona-eth",
  tierId: "fast",
  pricingType: "subscription_unlimited",
  evidenceLevel: "trust",
});

client.listenSignals({
  personaId: "persona-eth",
  onSignal: async (signal) => {
    const { ciphertext, keybox } = await client.fetchSignal(signal.signalHash);
    const plaintext = client.decryptSignal({ ciphertext, keybox, privateKey: keys.privateKeyBase64 });
    console.log("Signal:", plaintext);
  },
});
```

---

**Design alternatives (in case you prefer)**
1. **Pure on‑chain only**  
   - Hard today because pointers aren’t on‑chain.  
2. **Tapestry‑first**  
   - Good for v2 when Tapestry is mandatory.  
3. **Backend‑only**  
   - Easiest to ship, less verifiability.

---

**Questions to lock the SDK design**
1. Should the SDK **require a backendUrl**, or make it optional?  
2. Should the SDK **always verify on‑chain subscription NFT** before decrypting?  
3. Do you want **events as async iterator** (`for await`) or callbacks?

---

**Mini exercise (quick check)**
1. If the agent only listens to Tapestry and never checks on‑chain, what can go wrong?  
2. Why do we still need a pointer resolver even with on‑chain logs?  
3. Which part of the SDK should own keypair generation: SDK or the agent?

---

If you say “go”, I’ll add the SDK package under `/Users/heemankverma/Work/graveyard/sdk`, wire it to backend + on‑chain, and ship the first NPM‑ready version.
