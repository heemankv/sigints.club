# Testing Architecture

Date: 2026-02-15

Goal
Create a complete, layered testing suite for all components (programs, backend, SDK, MCP, frontend) with:
- Unit tests for core calculations and crypto.
- Integration tests for cross-module flows.
- End-to-end tests that exercise maker/taker workflows, tick delivery, SDK, and MCP streaming.

This doc is the blueprint only. Implementation starts after your approval.

---

## Mental Model (Intuition + Alternate Views)

Think about testing like a **pyramid** and like a **contract chain**:

1) Pyramid view (speed vs realism)
- Unit tests are fast, cheap, and isolate logic.
- Integration tests validate seams (DB, Solana, storage).
- E2E tests validate whole flows but are slower and more fragile.

2) Contract-chain view (who promises what)
- Programs promise data shape and invariants (e.g., `created_at` on-chain).
- Backend promises API behavior and storage consistency.
- SDK promises event decoding and correct decryption.
- MCP promises streaming and structured responses.
- Frontend promises user flow correctness.

We’ll blend both: unit tests validate correctness, integration tests validate contracts, E2E tests validate that contracts compose.

---

## Scope Map (What to test)

Components:
- Solana programs: `persona_registry`, `subscription_royalty`, `challenge_slashing`.
- Backend: API routes, storage provider interface, on-chain recorder client, signal publishing.
- SDK: event decoding, keybox handling, decryption, time filters, stream listening.
- MCP server: tools, streaming ticks, stop stream, error handling.
- Frontend: wallet gating, subscribe flow, profile rendering, feed, search, network checks.

Cross-cutting:
- Hybrid encryption scheme (keybox map, subscriber id hash).
- Pointer-based evidence storage (hash -> object store record).
- On-chain time anchor vs metadata time.

---

## Test Stack (Proposed Tooling)

These choices keep the stack consistent and fast:

- TypeScript unit/integration: `vitest` + `ts-node`/`tsx`.
- Backend API tests: `supertest` (HTTP), `vitest` runner.
- SDK tests: `vitest`, test against localnet + backend.
- MCP tests: `vitest` + spawn MCP process + JSON-RPC stdio harness.
- Solana program tests: Anchor TypeScript tests (localnet). Optional Rust unit tests for pure logic.
- Frontend unit tests: React Testing Library + `vitest`.
- Frontend E2E: Playwright (headless), with a mock wallet adapter for localnet.

Note: Wallet automation (Phantom) is hard in CI. We’ll use a “MockWalletAdapter” under test env.

---

## Environment Strategy

- **Unit/Integration**: use in-memory storage and localnet when needed.
- **E2E**: spin localnet, run backend, run SDK and MCP in-process or as child processes, then run scripts.

Determinism tactics:
- Use fixed seed keypairs for maker/taker.
- Reset localnet each run.
- Use explicit `maxAgeMs` in SDK/MCP to avoid flaky time windows.
- For block time, allow tolerance (e.g., ±10s).

---

## Unit Test Plan (Core Calculations)

Backend crypto and hashing:
- `subscriberIdFromPubkey` stable and deterministic.
- AES-GCM encrypt/decrypt round-trip.
- Wrapped key decrypts correctly for intended subscriber.
- Keybox map only decryptable by matching subscriber id.
- Pointer hash for ciphertext/keybox matches stored hash.

SDK:
- `decodeSignalRecord` layout decoding (length, field order).
- `normalizeCreatedAt` handles seconds vs milliseconds.
- `hexToBytes` rejects invalid inputs.

Program (if Rust unit tests):
- Space constants (account sizes).
- Enum mapping values (PricingType, EvidenceLevel).

Frontend:
- Network banner logic (localnet vs devnet).
- UI components rendering for empty state and loaded state.

---

## Integration Test Plan (Feature-level)

Backend + storage + metadata:
- `publishSignal` writes ciphertext, keybox, metadata.
- `GET /signals/latest` returns newest.
- `GET /signals/by-hash` returns correct record.
- `GET /storage/ciphertext/:sha` returns JSON payload.
- `GET /storage/keybox/:sha?subscriberId=...` returns only that entry.

Backend + Solana localnet:
- `record_signal` writes SignalRecord with on-chain `created_at`.
- Retrieved SignalRecord matches pointer hashes and persona.

SDK + backend:
- `fetchLatestSignal` -> `decryptSignal` yields correct plaintext.
- `listenForSignals` triggers on account change and delivers fresh tick.

MCP + SDK:
- `check_persona_tick` returns plaintext and anchored `createdAt`.
- `listen_persona_ticks` emits streaming messages, `stop_persona_ticks` stops.

Frontend + backend (API contract tests):
- profile page loads on-chain subscriptions without DB.
- subscribe page calls on-chain subscribe and updates UI.

---

## End-to-End Test Plan (System E2E)

Scenario: “3 makers, 10 listeners” with mixed trust/verifier and pricing tiers.

Actors:
- Makers: M1 (ETH price), M2 (Anime release), M3 (News digest)
- Takers: T1..T10
- Tiers: trust, verifier; pricing types: sub_limited, sub_unlimited, per_signal

Steps:
1) Boot localnet and deploy programs.
2) Start backend with local storage provider.
3) Register maker personas (on-chain PDA) and map them in backend.
4) For each taker, generate X25519 keys and register encryption key.
5) Subscribe takers to makers with tier/pricing mixes.
6) Makers publish signals (backend `publishSignal`).
7) On-chain `record_signal` executed for each signal.
8) SDK listeners receive ticks (confirm `createdAt` anchored on-chain).
9) MCP stream receives ticks for at least 2 takers.
10) “AI action” simulated (e.g., call stub `handleTick` -> writes file or logs).

Assertions:
- Every taker receives only their keybox entry.
- `createdAt` from on-chain is within acceptable tolerance.
- `maxAgeMs` filters stale ticks correctly.
- MCP streams stop cleanly.
- Subscriptions exist as NFTs in each taker wallet.

Notes:
- E2E can be a Node script under `/tests/e2e/` with a single command.

---

## Frontend E2E Plan (UI)

Because Phantom automation is hard, we’ll add a test-only wallet adapter.

Flow:
1) Launch frontend with `NEXT_PUBLIC_USE_TEST_WALLET=1`.
2) Open app, mock login, create/subscribe, view profile.
3) Check subscription NFT renders.

Assertions:
- Profile shows maker bots and subscriptions from on-chain.
- Feed displays latest ticks from backend.

---

## Test Data & Fixtures

- Fixed keypairs for:
  - Maker personas
  - Takers
  - Backend signer
- Test personas: `persona-eth`, `persona-anime`, `persona-news`.
- Tier IDs: `trust`, `verifier`.

---

## Minimal File/Folder Layout (Proposed)

- `/tests/unit/*`
- `/tests/integration/*`
- `/tests/e2e/*`
- `/backend/tests/integration/*`
- `/frontend/tests/*`
- `/sdk/tests/*`
- `/mcp-server/tests/*`

---

## What “Passing” Looks Like

- Unit tests: >90% coverage of crypto and parsing logic.
- Integration tests: all API + localnet flows green.
- E2E tests: full scenario runs in <5 minutes locally.

---

## Questions (To Confirm Before Implementation)

1) Do you want a single **master test command** that spins everything and runs all tests, or separate commands per package?
2) For E2E UI tests, are you okay with a **test wallet adapter** instead of Phantom automation?
3) Should we run E2E against **localnet only**, or also add a manual path for devnet/testnet?
4) Is it acceptable if the E2E test uses **simulated “AI action”** (e.g., writes a file) rather than a real agent?

---

## Quick Comprehension Checks

- If a tick is 90 seconds old and `maxAgeMs` is 60 seconds, what should the listener do?
- Why do we need integration tests even if unit tests are green?

