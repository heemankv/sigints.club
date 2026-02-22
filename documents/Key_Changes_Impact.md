# Key Changes Impact Plan (sigints.club)

Date: 2026-02-22
Status: Implemented in codebase (2026-02-22).

## 1) Understanding of the protocol (as defined in key_changes.md)
- Product name: **sigints.club** (Signals Intelligence), not Stream.club.
- Purpose: Social platform where humans + AI share **verifiable & perishable alpha** (high-frequency, time-sensitive signals).
- Signals range from basic (ETH price) to niche (trade alerts, strategic foresight).
- **Stream/Signal model**:
  - A *Stream* is a topic/channel (e.g., ETH price, “AI Displacement” play).
  - A *Signal* is a new update on the stream.
  - A *Intent* is a user post requesting a stream.
- **Public streams**: open/free, oracle-like (latest-only account state; signals are plaintext).
- **Private streams**: encrypted, paid, **monthly subscription only**.
  - Two evidence modes: **Trustable** vs **Verifiable**.
- **Discovery & posts**: Tapestry-based; request posts visible in feed with likes/comments.
- **Subscription listening**: Solana account change subscriptions + SDK abstraction.
- **MCP**: full parity with web features for AI bots.
- **Slashing**: later.

## 2) Current codebase snapshot (relevant)
- Uses **subscription_royalty** program with `record_signal` storing hashes/pointers.
- Pricing types currently allow: `subscription_limited`, `subscription_unlimited`, `per_signal`.
- Backend encrypts all signals and produces a keybox for subscribers.
- UI allows tier selection; pricing info displayed; some per-signal labels exist.
- Discovery is **Tapestry-first** for posts/feeds.
- Tapestry is mandatory for discovery and social (no backend fallback).
- SDK listens to on-chain signal account changes and decrypts via backend storage.

## 3) Gaps between key_changes.md and current code
### A) Branding
- Frontend and docs still reference sigints.club/Stream.club in places.

### B) Public vs Private streams
- The code treats all signals as encrypted/private. There is no explicit **public stream** path.

### C) Pricing model
- Current code supports **per-signal pricing** and **limited subscriptions**. Spec now requires:
  - **Monthly subscription only** for private streams.
  - Public streams are free.

### D) Evidence model
- Trust vs Verifiable exists but should be **explicitly tied to private streams**, not public.

### E) Signal model
- We already moved to **latest-only** (oracle-style). Need to ensure all code/docs are consistent.

### F) Discovery flow
- Requests (Intents) should be a **first-class post type** with clear UX in feed + link to signals.

### G) MCP parity
- MCP should include endpoints to fetch public signal updates (no keybox) and private (keybox).

## 4) Proposed changes (by layer)

### 4.1 On-chain (programs)
- **SignalLatest PDA** already updated; verify instruction name and seeds in docs.
- Add/confirm a **signal type** or evidence mode on-chain **only if needed** for enforcement.
  - MVP: keep evidence type in registry tier configs, not in signal record.
- Enforce **monthly subscription only**:
  - Remove/disable `per_signal` and `subscription_limited` in TierConfig validation.
  - Update error messages and tests accordingly.
- Allow **public stream signals** to be recorded without active subscribers:
  - Currently `record_signal` requires `subscription_count > 0`.
  - For public stream signals, this should be **optional**.
  - Proposed approach: add `is_public` flag on stream/tier config, and skip `NoSubscribers` check when public.

### 4.2 Backend
- Add **public signal path**:
  - If a signal is public: skip keybox generation and encryption (store plaintext or store ciphertext but no keybox).
  - Return metadata with `keyboxHash/keyboxPointer = null` for public stream signals.
- Update signal publish API to include `signalType` or `visibility: public|private`.
- Enforce **monthly-only tiers** in creation and validation.
- Update feed logic to treat **Intents** as primary posts; allow linking to signal pages.

### 4.3 SDK / MCP
- SDK `listenForSignals` should support:
  - **Public mode**: fetch plaintext directly from backend storage (no keybox).
  - **Private mode**: use keybox + decrypt as now.
- MCP tools should expose:
  - `listen_public_signal` and `listen_private_signal` (or a single tool with `visibility` parameter).
  - `post_intent` for request creation.

### 4.4 Frontend
- Branding update to **sigints.club** (title, logos, copy).
- Add clear **Public vs Private** badges on signal cards.
- Remove per-signal pricing UI; show **monthly price only**.
- Intent composer should be first-class (not hidden):
  - Intent posts should support linking to created signals.
- Signal detail view should clarify: trustable vs verifiable, public vs private, monthly price.

### 4.5 Tests
- Update tests that assume per-signal pricing.
- Add tests for:
  - Public signal publish (no keybox; `record_signal` allowed without subscribers).
  - Private signal publish (requires subscribers; keybox present).
  - SDK/MCP public listening path.

### 4.6 Docs
- Update docs to reflect:
  - **Latest-only** signal account.
  - **Public vs private streams** and encryption differences.
  - **Monthly-only** pricing.
  - **sigints.club** branding.

## 5) Implementation plan (ordered)
1. **Branding updates** (frontend + docs) — low risk.
2. **Pricing model change** (remove per-signal/limited):
   - Update registry tier config validation.
   - Update backend tier creation.
   - Update UI display and seed data.
3. **Public signal support**:
   - On-chain: allow record without subscribers if public.
   - Backend: skip keybox for public, return metadata accordingly.
   - SDK/MCP: support public listen path.
4. **Intent-first UX**:
   - Feed composer default to intent.
   - Signal posts link to intent thread.
5. **Tests + docs** updates.

## 6) Open questions to finalize
1. **Signal streams per stream**: one stream per stream or multiple signal IDs?
2. **Public signal storage**: store plaintext directly or store ciphertext with a public keybox?
3. **Enforcement**: should “public” be enforced on-chain or only by backend rules?

---

If this matches your expectations, I’ll start implementing the changes in this exact order.
