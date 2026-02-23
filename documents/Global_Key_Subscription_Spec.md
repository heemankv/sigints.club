# Global Key + Private Subscription Enforcement Spec

**Goal:**
- Only a **global wallet key** is supported (no per‑subscription key).
- Users **must register a global key** before subscribing to private streams.
- Users can **rotate the global key**, and the change **takes effect for the next signal**.
- **Backend → SDK → Frontend**: frontend never calls backend directly.

---

## 1) Current State (for grounding)

- On‑chain program supports **both** `register_key` (per subscription) and `register_wallet_key` (global).
- Backend `/subscribe` currently accepts a per‑subscription key override (encPubKey), otherwise falls back to wallet key PDA.
- Frontend calls backend directly for `/subscribe` and builds on‑chain subscribe transaction itself.
- Keybox retrieval checks **subscriber_key OR wallet_key**, so per‑subscription key still works.

This violates the new requirement.

---

## 2) Desired Behavior (new contract/API model)

### **Global key only**
- The **only** accepted key source is **WalletKey PDA** (`register_wallet_key`).
- Any per‑subscription key mechanism is **ignored/disabled**.

### **Private stream subscription requires global key**
- If stream is `private`, user must have an on‑chain WalletKey registered **before** subscribing.
- If stream is `public`, subscription can proceed without a key (but is free anyway).

### **Key rotation**
- User can re‑register a new global key via `register_wallet_key`.
- Backend updates its subscriber directory for all streams the user is subscribed to.
- **New signals use the new key**. Old signals remain encrypted to the old key.

---

## 3) Changes by Layer (Backend → SDK → Frontend)

### A) Backend

#### A1. Remove per‑subscription key usage
- `/subscribe` **does not accept** `encPubKeyDerBase64` anymore.
- Always reads the WalletKey PDA to determine subscriber encryption key.
- If WalletKey PDA does not exist → `400 wallet encryption key not registered`.

#### A2. Enforce private‑stream key requirement
- Backend must determine stream visibility from Tapestry stream metadata.
- If `stream.visibility === "private"` and no wallet key on-chain → reject subscription.

#### A3. Add wallet key sync endpoint
- `POST /wallet-key/sync`
  - Input: `{ wallet: string }`
  - Fetches WalletKey PDA from chain.
  - Finds all active subscriptions for that wallet.
  - Updates subscriber directory entries for those streams with the **new encPubKey**.

#### A4. Keybox retrieval
- Only accept WalletKey PDA; ignore SubscriberKey PDA.
- If no WalletKey PDA → reject (`403 encryption key not registered`).


### B) SDK

The SDK becomes the **only** client of backend API.

#### B1. Global key registration
- Add `registerWalletKey(encPubKeyBase64)` helper:
  1. Builds and sends `register_wallet_key` on-chain.
  2. Calls backend `/wallet-key/sync` to refresh encryption key in directory.

#### B2. Subscribe (private enforcement)
- Add `subscribeToStream(streamId, tierId, …)` helper:
  - Fetch stream metadata (visibility).
  - If `private`, verify wallet key PDA exists (or force register flow).
  - Submit on-chain subscribe instruction.
  - After confirm, call backend `/subscribe` (no key included).

#### B3. Key rotation
- `updateWalletKey(newPubKey)` is just `registerWalletKey()` again + `sync` call.


### C) Frontend

Frontend uses SDK only.

#### C1. Subscription UI
- Remove “paste encryption key” field.
- If private stream & no wallet key:
  - show action: **“Register Wallet Key”** (links to KeyManager).
  - block subscribe button until key exists.

#### C2. Key Manager
- Provide GitHub‑style key generation instructions.
- “Register Key On‑chain” button calls SDK `registerWalletKey`.
- Show last updated time (from WalletKey PDA) for clarity.

#### C3. Remove per‑subscription key UI
- No per‑stream key prompt in subscribe form.

---

## 4) Contract Changes (Optional)

**Strict on‑chain enforcement** would require:
1. Add `visibility` to `StreamConfig` in `stream_registry`.
2. In `subscribe`, if stream is private, require WalletKey PDA exists.

This is **optional** for MVP since enforcement can be done in SDK + backend.

---

## 5) Example Flows

### Example A — Private stream, new subscriber
1. User generates X25519 key locally.
2. Calls `registerWalletKey` (on-chain + backend sync).
3. Subscribes to private stream (allowed).
4. Next signals are encrypted to their new key.

### Example B — Key rotation
1. User updates key via `registerWalletKey`.
2. Backend syncs new key for all subscriptions.
3. Next ticks use new key; old signals still decrypt with old key.

---

## 6) Open Questions

1. Should we force a **re‑subscribe** when key rotates (strict), or allow seamless update (recommended)?
2. Do we want to **backfill** subscriber directory for all subscriptions on startup?

---

## 7) Acceptance Criteria

- Subscribing to a private stream without wallet key fails.
- Per‑subscription keys are ignored everywhere.
- Registering a new wallet key changes encryption for the **next** tick.
- Frontend never calls backend directly.
