# Technical Low-Level Architecture (MVP)
Project: Persona.fun
Date: 2026-02-14

## Purpose
Define the low-level technical choices and component interfaces for the hackathon MVP. This is intentionally minimal and optimized for speed of delivery.

## Language and Stack Decisions
1. On-chain programs: Rust with Anchor.
2. Frontend: Next.js (React).
3. Backend and agents: Node.js with TypeScript.
4. Tapestry integration: socialfi NPM package (TypeScript).

Rationale: fastest developer experience, best JS/TS ecosystem for Tapestry, and solid Solana support.

## Social Layer (Tapestry)
Tapestry stores the social graph in an off-chain graph database, organizes it into Merkle trees, and anchors the Merkle root on Solana for verifiability. This is managed by Tapestry; we do not run this database ourselves.

We use Tapestry for:
1. Profiles (Persona identities).
2. Follows (subscriptions and discovery signals).
3. Content (subscription requests and signal posts).
4. Likes and comments (reputation signals).

## Datastores We Own
1. Postgres (Supabase) for application metadata and indexer data.
2. Object storage (Supabase Storage or S3) for ciphertext and keyboxes.

We store:
- Signals metadata (hashes, pointers, tiers, timestamps).
- Keybox pointers and hashes.
- Subscription cache (optional for backend fast lookup).
- Discovery metrics and ranking scores.

## On-Chain Programs (Anchor)
Three programs as per Protocol_Spec_v0.1:
1. Registry Program
- create_persona
- update_persona
- set_tiers

2. Subscription + Royalty Program
- subscribe
- renew
- cancel (optional)
- record_signal (optional for audit)

3. Challenge + Slashing Program
- open_challenge
- resolve_challenge
- slash_and_refund

## PDA Accounts (Minimal)
1. PersonaConfig PDA
- persona_id, managers, tiers_hash, status

2. Subscription PDA
- subscriber_pubkey, persona_id, tier_id, expires_at, quota_remaining

3. SignalRecord PDA (optional MVP)
- signal_hash, signal_pointer, keybox_hash, keybox_pointer, created_at

4. Challenge PDA
- challenger_pubkey, signal_hash, status, created_at

## Backend Services
1. API service (Node/TS)
- POST /signals
- POST /evidence
- GET /signals?persona_id=...
- POST /challenge

2. Indexer service
- Polls Solana logs and Tapestry API.
- Computes discovery metrics.
- Writes ranking scores into Postgres.

3. Storage service
- Stores ciphertext and keyboxes.
- Returns object pointers.

## Agent Services
1. Provider Agent
- Polls external sources.
- Generates signal and evidence.
- Calls backend to store ciphertext and keybox.
- Writes on-chain metadata and posts to Tapestry.

2. Listener Agent
- Polls signals via backend or Solana logs.
- Retrieves ciphertext and keybox.
- Decrypts and triggers workflow.

3. Audit Agent (optional MVP)
- Verifies evidence on challenge.

## Encryption Delivery (MVP)
Use the hybrid scheme defined in Hybrid_Encryption_Delivery.md:
- Encrypt signal once with symmetric key.
- Encrypt symmetric key per subscriber.
- Store ciphertext and keybox off-chain.
- On-chain stores hashes and pointers.
- Subscriber id is hash of encryption public key.

## Request Templates (Domain-Specific)
Request posts are Tapestry content with custom properties. Fields include:
- domain
- asset
- evidence_level
- max_latency_ms
- price_tiers
- ttl_seconds
- effective_at

## MVP Data Flow
1. User posts subscription request in Tapestry.
2. Manager creates Persona and tiers on-chain.
3. Provider agent publishes encrypted signal and on-chain metadata.
4. Taker polls, finds key entry, decrypts, and uses signal.

## What We Are Not Building (MVP)
1. Group key rotation.
2. Advanced slashing arbitration.
3. Personalized discovery ranking.

## Dependencies
- socialfi NPM package for Tapestry integration.
- Solana framework-kit and @solana/kit for frontend and backend.
- Anchor for on-chain programs.

## Next Implementation Steps
1. Generate Anchor program skeletons.
2. Define account structs and instruction args.
3. Build backend endpoints and storage layer.
4. Implement provider and listener agents.
5. Build minimal Next.js UI for discovery and subscription.
