# Testing Architecture

Date: 2026-02-20

## Status
The testing plan is now **implemented** across backend and E2E. Backend unit + integration tests pass, and a full localnet E2E flow passes (subscribe → NFT mint → record_signal → SDK + MCP tick delivery).

---

## Mental Model (Intuition + Alternate Views)
Testing is both a **pyramid** (speed vs realism) and a **contract chain** (who promises what):
- Unit tests validate pure logic fast.
- Integration tests validate storage + API behavior.
- E2E tests validate full maker/taker workflows.

---

## Scope Map (Current Coverage)
- **Programs**: subscription + persona registry behavior validated in E2E.
- **Backend**: storage, encryption, signal publishing, API endpoints.
- **SDK**: listen + decrypt + on-chain `createdAt` path (E2E).
- **MCP**: streaming + check tool (E2E).
- **Frontend**: build passes; UI integration tests pending.

---

## Test Stack (Actual)
- Backend: `vitest` + `supertest`.
- E2E: `vitest` in `/tests/e2e` + localnet.
- Frontend: build passes (type-check). Playwright tests are optional and not yet wired to CI.

---

## Current Test Commands
- Backend tests:
  - `npm -C /Users/heemankverma/Work/graveyard/backend run test`
- E2E tests (localnet required):
  - `npm -C /Users/heemankverma/Work/graveyard/tests run test:e2e`

---

## E2E Scenario (Implemented)
Scenario: **3 personas + 10 listeners** on localnet.

Flow tested:
1. Localnet + programs deployed.
2. Personas + tiers registered on-chain.
3. Takers subscribe (NFT minted).
4. Signals published, ciphertext + keybox stored.
5. `record_signal` written on-chain.
6. SDK listeners receive ticks (maxAge enforced).
7. MCP stream receives ticks.

Assertions:
- NFT minted per subscriber.
- On-chain persona state updated.
- Signal record created with on-chain `createdAt`.
- SDK + MCP both decrypt correctly.

---

## Known Test Gaps (Next)
- Frontend E2E (Playwright) for feed + subscribe modal.
- On-chain slashing challenge tests (future). 
- Rate-limit tests for social feed.
