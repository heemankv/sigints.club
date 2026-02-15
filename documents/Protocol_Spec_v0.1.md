# Protocol Spec v0.1 (Hackathon MVP)
Project: Persona.fun
Date: 2026-02-14

## Purpose
This document locks the minimum technical decisions needed to move into low-level implementation while keeping hackathon scope in mind. It chooses the simplest viable options and defers non-essential complexity.

## 1. Subscription Tier Schema (Maker-Defined Menu)
**Decision:** Use a compact tier object with explicit time fields.

Tier fields (MVP):
- tier_id (string)
- pricing_type: subscription_limited | subscription_unlimited | per_signal
- price_amount (number)
- price_token (string, default: USDC)
- billing_period_days (integer, default: 30)
- quota_signals (integer, optional for subscription_limited)
- evidence_level: trust | verifier
- max_latency_ms (integer)
- effective_at (timestamp)
- expires_at (timestamp, optional)

Rationale: Rich enough for pricing and SLA, but still small for hackathon.

## 2. On-Chain Instruction Set (3 Programs)
**Decision:** Use three programs with a minimal instruction set.

### A. Registry Program
- create_persona
- update_persona
- set_tiers

### B. Subscription + Royalty Program
- subscribe (records tier selection and payment)
- renew (extends expiry)
- cancel (optional)
- record_signal (stores hash + pointer metadata, optional but useful for audit)

### C. Challenge + Slashing Program
- open_challenge
- resolve_challenge
- slash_and_refund

Rationale: minimum set for full lifecycle.

## 3. PDA Account Layout (Minimal)
**Decision:** Keep accounts small and focused.

1. PersonaConfig PDA
- persona_id
- managers (pubkeys or DAO address)
- tiers_hash
- status

2. Subscription PDA
- subscriber_pubkey
- persona_id
- tier_id
- expires_at
- quota_remaining (optional)
- subscription_nft_mint (1-of-1 SPL token mint for this subscription)

3. SignalRecord PDA (optional for MVP)
- signal_hash
- signal_pointer
- keybox_hash
- keybox_pointer
- created_at

4. Challenge PDA
- challenger_pubkey
- signal_hash
- status
- created_at

## 4. Evidence Schema (MVP)
**Decision:** Minimal evidence metadata.

Evidence fields:
- evidence_hash
- evidence_pointer
- source_type (api, onchain, screenshot)
- source_ref (url or tx hash)
- captured_at
- proof_type (log, screenshot, tx)

## 5. Discovery Index + Ranking
**Decision:** Weighted sum ranking.

Score = 0.4 * accuracy_30d + 0.25 * latency_score + 0.2 * evidence_score + 0.15 * price_score

Data fields (indexer):
- accuracy_30d
- median_latency_ms
- evidence_score
- price_score
- slash_rate_30d
- follower_count

Rationale: simple and explainable for MVP.

## 6. Agent API Contract (Hackathon)
**Decision:** REST + polling.

Provider endpoints:
- POST /signals (publish signal + metadata)
- POST /evidence (upload artifacts)

Listener endpoints:
- GET /signals?persona_id=...

Auditor endpoints:
- POST /challenge
- POST /challenge/resolve

Rationale: simplest integration, easy demo.

## 7. Security Assumptions (MVP)
- Maker can be malicious → slashing enforces honesty.
- Verifier can be malicious → require evidence and audit.
- Subscriber key leakage → user risk; allow rotation later.
- Backend downtime → on-chain hash still proves integrity.

## 8. Encryption + Keybox Policy
**Decision:** Hybrid encryption with public keybox.

- Subscriber id = hash(encryption_pubkey)
- Keybox is public, contains (subscriber_id, EncKey)
- Ciphertext and keybox stored off-chain
- On-chain stores hashes + pointers
- No key rotation for MVP

## 9. MVP Domain Choice
**Decision:** ETH best price feed across sources.

Rationale: simple, fast to demo, clearly measurable.

## 10. Testing + Deployment (Staged)
**Decision:** Staged rollout with minimal tests.

Stage A: Local validator + happy-path tests
Stage B: LiteSVM/Mollusk unit tests (optional)
Stage C: Devnet integration (optional if time)

## Deferred (Post-Hackathon)
- Tier key rotation
- MLS/TreeKEM group encryption
- Advanced indexer personalization
- On-chain evidence attestation
- Automated payouts to managers

## Summary
This spec prioritizes shipping a working, secure MVP while keeping the architecture extensible. It documents the minimum viable data models, program instructions, and operational flows required to start low-level implementation.
