# Blinks Enablement – Codebase Changes (Detailed)
Date: 2026-02-24

This document explains the exact changes made to enable **Solana Actions + Blinks** for stream subscriptions and to allow **private subscriptions without a pre‑registered key**, so Blinks can work for private streams.

---

## 1) On-Chain Program Changes
**File:** `/Users/heemankverma/Work/graveyard/programs/subscription_royalty/src/lib.rs`

### Change: Private subscribe no longer requires `subscription_key`
**Before**
- `subscribe` required `require_subscription_key(...)` for private streams.
- This meant **private subscriptions failed** unless the key already existed.

**After**
- The subscription key requirement was removed from `subscribe`.
- This allows a **private subscription to succeed even without a key**, which is necessary for Blinks (since a Blink cannot generate user encryption keys).

### Change: Account list for `Subscribe` instruction
**Before**
- `Subscribe` accounts included `subscription_key` (validated in handler).

**After**
- `subscription_key` was removed from the `Subscribe` accounts list.

**Reason**
The Action/Blink transaction must be signable without requiring a pre‑existing key account.

---

## 2) SDK Changes (Subscribe Instruction)
**File:** `/Users/heemankverma/Work/graveyard/sdk/src/solana/subscription.ts`

### Change: Remove `subscription_key` from subscribe builder
**Before**
- `buildSubscribeInstruction` derived and included `subscription_key` in the accounts list.

**After**
- `subscription_key` is no longer derived or passed in the instruction.

**Why**
The on-chain program no longer requires it, and Blinks should work even when no key exists.

---

## 3) Backend Changes (Actions + Subscription Flow)
**File:** `/Users/heemankverma/Work/graveyard/backend/src/routes.ts`

### A) New Action Endpoints
**Added**
- `GET /actions/stream/:id`
  - Returns **Action metadata** (`type`, `icon`, `title`, `description`, `links.actions`).
  - This is what renders the Blink UI in compatible clients.

- `POST /actions/stream/:id/subscribe`
  - Accepts `{ account: <wallet pubkey> }`.
  - Builds and returns a **base64 transaction** for the subscription.
  - The transaction **mints the non‑transferable subscription NFT** (soulbound).
  - Includes a `message` that tells users to register a key if needed.

### B) Blink Link Generator
**Added**
- `GET /actions/stream/:id/link`
  - Returns:
    - `streamUrl` (canonical Blink URL)
    - `actionUrl`
    - `blinkUrl` (same as `streamUrl`)
    - `directBlinkUrl` (`?action=...`)

### C) Subscribe API behavior change
**Endpoint:** `POST /subscribe`
**Before**
- Private subscription failed if `sub_key` missing.

**After**
- Private subscription is allowed even without key.
- If key missing, response includes:
  - `subscriberId: null`
  - `needsKey: true`

### D) On-chain subscribe endpoint behavior
**Endpoint:** `POST /subscribe/onchain`
**Before**
- Private subscribe required a key before submitting.

**After**
- Private subscribe allowed without key.

### E) Base URL resolution (local testing)
**Change**
- When generating Blink URLs, backend uses `Origin` header if present.
- This fixes local copy behavior (so `localhost:3000` is returned instead of `localhost:3001`).

---

## 4) Backend Subscription Builder (New)
**File:** `/Users/heemankverma/Work/graveyard/backend/src/routes.ts`

### Added: Minimal subscribe instruction builder
Because the backend needs to produce a transaction **without** relying on frontend SDK logic, we added:
- `encodeSubscribeData(...)`
- `buildSubscribeInstruction(...)`

This mirrors the on-chain instruction layout so Actions can return a valid transaction.

---

## 5) Frontend Changes

### A) Actions mapping (`actions.json`)
**File:** `/Users/heemankverma/Work/graveyard/frontend/public/actions.json`

**Change**
- `apiPath` now uses **relative `/actions/stream/*`**.
- This allows local testing with a Next.js rewrite.

### B) Next.js rewrite to backend
**File:** `/Users/heemankverma/Work/graveyard/frontend/next.config.js`

**Added**
```js
rewrites() {
  return [{ source: "/actions/:path*", destination: "http://localhost:3001/actions/:path*" }]
}
```
This makes:
- `http://localhost:3000/actions/*` → backend

### C) Blink copy button
**Files**
- `/Users/heemankverma/Work/graveyard/frontend/app/components/CopyBlinkButton.tsx`
- `/Users/heemankverma/Work/graveyard/frontend/app/stream/[id]/StreamPageClient.tsx`
- `/Users/heemankverma/Work/graveyard/frontend/app/components/MyStreamsSection.tsx`

**UI**
Adds a **“Copy Blink”** button next to the stream name on:
- Stream page
- My Streams page

### D) Subscribe UX (private streams)
**File:** `/Users/heemankverma/Work/graveyard/frontend/app/stream/[id]/SubscribeForm.tsx`

**Change**
- Subscription no longer blocked when key is missing.
- UI now explains:
  - “Subscribe now; add a key to decrypt later.”
- Status message reflects `needsKey` response.

---

## 6) SDK Backend Client Updates
**Files**
- `/Users/heemankverma/Work/graveyard/sdk/src/backend.ts`
- `/Users/heemankverma/Work/graveyard/frontend/app/lib/sdkBackend.ts`

**Added**
- `fetchBlinkLink(streamId)` API.
- `needsKey?: boolean` in `SubscribeResponse`.

---

## 7) How to Test Locally

### Prereqs
Set these env vars (backend):
```
PUBLIC_APP_URL=http://localhost:3000
PUBLIC_API_URL=http://localhost:3001
```

### Test URLs
- **Action metadata**
  ```
  http://localhost:3000/actions/stream/<streamId>
  ```
- **Blink URL**
  ```
  http://localhost:3000/stream/<streamId>
  ```

### Note
Blink UI will not appear in a normal browser. Use a Blink inspector with a public tunnel if you want to see full UI.

---

## 8) Why This Works
- **Actions** provide metadata + a transaction to sign.
- The **subscription transaction mints a non‑transferable NFT**, so the user “sees the soulbound NFT” once they sign.
- By removing the key requirement from `subscribe`, **Blinks work for private streams** even if no key exists.

---

## 9) Remaining Known Constraints
- A Blink **cannot generate** the user’s X25519 keypair.
- For private streams, decryption still requires manual key registration in the app/agent runtime.

---

## 10) Summary
We now have:
- A Blink that subscribes users to streams.
- SBT minting on signature.
- Local testing support.
- A clear “key missing” state for private streams.

All changes above are in place and can be iterated without breaking the Blink flow.
