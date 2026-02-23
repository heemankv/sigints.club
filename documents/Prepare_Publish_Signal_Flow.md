# Prepare → Publish Signal Flow (Backend + SDK + Frontend)

This document explains the two‑step signal publishing flow and how it is used across the backend, SDK, and frontend. It is written for **gut‑level intuition** with concrete examples, plus quick exercises at the end.

---

## 1. Core Idea (Intuition)

Think of a signal publish as **two separate responsibilities**:

1. **Prepare (off‑chain)**
   - Do the heavy, private work: encryption, key wrapping, storage.
   - Produce small, immutable **hashes and pointers** that can go on‑chain.

2. **Publish (on‑chain)**
   - The maker signs a transaction that records those hashes and pointers.
   - This updates the on‑chain **SignalLatest PDA**, which listeners subscribe to.

**Why split it?**
- Encryption and storage are expensive to do on‑chain.
- On‑chain should only store tiny immutable commitments (hashes/pointers).
- The maker must be the one who signs the on‑chain publish to keep authority clean.

---

## 2. Backend: What “Prepare” Does

### Endpoint
`POST /signals/prepare`

### Input
```json
{
  "streamId": "stream-eth",
  "tierId": "tier-basic",
  "plaintextBase64": "...",
  "visibility": "private"
}
```

### Steps (Backend)
1. **Resolve subscribers** (only for private streams).
2. **Encrypt plaintext** using a fresh symmetric key.
3. **Wrap that symmetric key** for each subscriber (keybox).
4. **Store** ciphertext + keybox in storage.
5. **Return metadata** (hashes + pointers).

### Output
```json
{
  "metadata": {
    "streamId": "stream-eth",
    "tierId": "tier-basic",
    "signalHash": "<sha256 of ciphertext>",
    "signalPointer": "backend://ciphertext/<sha>",
    "keyboxHash": "<sha256 of keybox>",
    "keyboxPointer": "backend://keybox/<sha>",
    "visibility": "private",
    "createdAt": 1771777777777
  }
}
```

**Public stream case**: backend skips keybox and returns only `signalPointer` + `signalHash`.

---

## 3. On‑chain “Publish”: What Happens

After preparing, the maker signs a Solana transaction calling:

```
record_signal(
  signalHash,
  signalPointerHash,
  keyboxHash,
  keyboxPointerHash
)
```

This updates:
- **SignalLatest PDA** for that stream
- Optional stream state (for metadata tracking)

Listeners then:
- Subscribe to account changes on SignalLatest PDA.
- When it changes, they fetch from the backend using the pointer.

---

## 4. SDK Usage (Maker)

### Step 1 — Prepare (off‑chain)
```ts
const client = new SigintsClient({
  rpcUrl,
  backendUrl,
  programId,
  streamRegistryProgramId
});

const meta = await client.prepareSignal({
  streamId: "stream-eth",
  tierId: "tier-basic",
  plaintext: "ETH broke 2k",
  visibility: "private"
});
```

### Step 2 — Build instruction (on‑chain)
```ts
const ix = await client.buildRecordSignalInstruction({
  authority: makerPubkey,
  streamId: "stream-eth",
  metadata: meta
});

// Then sign and send using your wallet adapter or keypair
```

**Note:** SDK does NOT send the transaction, it only builds the instruction. This is by design so both bots and UI can control signing.

---

## 5. Frontend Usage (Maker UI)

### Where it lives
- `Profile → My Streams → Publish` panel
- `Stream detail page → Maker Operations`

### What the UI does
1. **Prepare Signal** button
   - Calls backend `/signals/prepare` via SDK helper.
   - Stores metadata in state.
2. **Publish On‑chain** button
   - Builds transaction instruction via SDK helper.
   - Uses wallet adapter to sign + send.

This matches the exact same logic a bot would use via the SDK.

---

## 6. Example Walkthrough

### Example: Private stream
- Stream: `iphone-exchange`
- Signal: `"iPhone 13 exchange reopened"`

**Prepare phase**
- Backend encrypts message and produces:
  - ciphertext pointer: `backend://ciphertext/abc123...`
  - keybox pointer: `backend://keybox/def456...`
  - hashes of each pointer

**Publish phase**
- Maker signs `record_signal` with those hashes
- SignalLatest PDA updates
- Subscribers detect change and fetch ciphertext + keybox

### Example: Public stream
- Stream: `eth-price`
- Signal: `"ETH is 2100"`

**Prepare phase**
- Backend stores plaintext payload only
- Returns pointer + hash

**Publish phase**
- Maker signs `record_signal` with signal hash + pointer hash
- Anyone can fetch the payload (no keybox)

---

## 7. Why This Is the Correct Split

### Alternative view
Think of it like a “package delivery” system:
- **Prepare** = pack the box + put labels on it
- **Publish** = put the tracking number on the public billboard

The blockchain only needs the tracking number; the package lives off‑chain.

### Benefits
- Cheaper on‑chain cost
- Maker must sign on‑chain (authenticity)
- Storage can be swapped (backend → DA layer later)

---

## Exercises (Quick Checks)

1. If the backend returns a `signalPointer` but **no `keyboxPointer`**, what does that tell you about the stream’s visibility?
2. Why do we store **hashes** of pointers on‑chain instead of the full data?
3. In your own words, explain the difference between **Prepare** and **Publish**.

If you want, send me your answers and I’ll correct them.
