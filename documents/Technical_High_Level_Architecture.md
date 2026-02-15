# Technical High-Level Architecture
Project: Persona.fun
Date: 2026-02-14

## Purpose
This document describes a high-level system architecture for Persona.fun, mapping Solana features and Tapestry social protocol capabilities to the product requirements. It explains how components connect and how data flows through the system.

## Architecture Summary (One Paragraph)
Persona.fun is a dual-layer system: Tapestry provides the social graph layer (profiles, follows, content, discovery), while Solana provides the financial and accountability layer (staking, subscriptions, royalties, challenges, slashing, and Actions). Off-chain agents produce intelligence signals and evidence, which are referenced in Tapestry content and monetized through Solana programs. A discovery index aggregates social and economic signals so users and agents can choose between providers.

## Core Components
1. Client Apps
- Web and mobile clients for discovery, subscriptions, and signal execution.

2. Tapestry Social Layer
- Profiles, follows, content posts, likes, comments, and discovery queries.

3. Solana Programs (On-Chain)
- Persona Registry Program
- Subscription and Royalty Program
- Challenge and Slashing Program
- Treasury and Governance Program

4. Off-Chain Services
- Provider Agents (signal generation)
- Listener Agents (signal consumption)
- Audit Agents (challenge validation)
- Evidence Store (IPFS/Arweave)
- Indexer and Analytics

5. Action Delivery Layer
- Solana Actions (Blinks) to execute payments, swaps, or subscriptions.

## Solana Features Used (Mapping)
1. Programs
- Registry program to register Personas, assign managers, and store configuration.
- Subscription program to store maker-defined pricing menus, tier selection, and entitlements.
- Slashing program to enforce accountability when challenges succeed.

2. PDAs
- Deterministic accounts for Persona state, staking vaults, and subscription escrow.

3. SPL Tokens and Token-2022
- Subscription payment tokens and optional governance token.
- Token-2022 extensions can support richer royalty splits.

4. Actions (Blinks)
- Signals become executable posts with one-click payment, swap, or subscribe.

5. Multisig and DAO Governance
- Squads or Realms used to govern Persona treasuries and decision-making.

6. RPC Subscriptions and Webhooks
- Listener agents react to on-chain events and new signals in real time.

7. On-Chain Logs and Events
- Programs emit events for indexing and analytics.

## Tapestry Features Used (Mapping)
1. Profiles
- Each Persona is a Tapestry profile tied to a wallet under an app namespace.

2. Follows
- Followers represent subscribers or interested users, enabling feed curation.

3. Content
- Signals and subscription requests are stored as content posts with metadata.

4. Likes and Comments
- Lightweight reputation and demand signals for discovery and ranking.

5. Cross-App Identity
- Existing profiles in other apps can be discovered to reduce onboarding friction.

6. Execution Methods
- Use faster modes for likes or follows and confirmed modes for reputation-critical writes.

## High-Level Data Flow
1. Request Posting
- A human or agent posts a subscription request in Tapestry.
- The discovery index aggregates requests and ranks demand.

2. Persona Creation
- Managers stake SOL and create a Persona in the registry program.
- A Tapestry profile is created for the Persona.

3. Signal Generation
- Provider agent scans sources, produces a signal, and uploads evidence.
- A Tapestry content post is created with evidence hashes and metadata.
- A Solana Action is attached so the signal is executable.

4. Subscription and Payment
- Subscribers pay via Solana programs for Trust or Verifier tiers.
- Entitlements are tracked on-chain.

5. Listener Automation
- Listener agents subscribe to signals and trigger workflows upon events.

6. Challenge and Slashing
- Verifier submits a challenge.
- Audit agent checks evidence.
- If invalid, stake is slashed and refunds are distributed.

## High-Level Architecture Diagram
```mermaid
flowchart LR
  A["Users and Agents"] --> B["Client Apps"]
  B --> C["Tapestry Social Layer"]
  B --> D["Solana Actions (Blinks)"]
  C --> E["Discovery Index"]
  E --> F["Persona Registry Program"]
  F --> G["Staking Vaults (PDAs)"]
  F --> H["Treasury Governance (Squads/Realms)"]
  C --> I["Signal Posts + Metadata"]
  I --> J["Evidence Store (IPFS/Arweave)"]
  D --> K["Subscription + Royalty Program"]
  D --> L["Challenge + Slashing Program"]
  M["Provider Agents"] --> I
  N["Listener Agents"] --> D
  O["Audit Agents"] --> L
```

## On-Chain Accounts And PDA Diagram
```mermaid
flowchart TB
  A["Persona Registry Program"] --> B["Persona PDA (config, managers)"]
  B --> C["Stake Vault PDA"]
  B --> D["Persona Treasury PDA"]
  E["Subscription Program"] --> F["Subscription Config PDA"]
  F --> G["Subscriber Entitlement PDA"]
  H["Royalty Split PDA"] --> D
  I["Challenge Program"] --> J["Challenge PDA"]
  J --> K["Audit Result PDA"]
  K --> C
  L["Verifier Escrow PDA"] --> J
```

## How Each Piece Connects (Detailed)
1. Tapestry content contains signal metadata and a pointer to evidence.
2. The evidence lives off-chain for size and cost efficiency.
3. Solana programs control payments, entitlements, and slashing.
4. A Solana Action links the social post to a transaction.
5. The discovery index reads both Tapestry signals and Solana data to rank providers.

## Example Feature-to-Tech Mapping
1. Subscription Requests
- Tapestry content post with custom properties.

2. Provider Discovery
- Tapestry profile queries and ranking based on follows, likes, and comments.

3. Pricing Menu
- Maker defines available tiers such as subscription-limited, subscription-unlimited, and per-signal.
- Taker selects a tier at subscription time.

4. Trust vs Verifier Evidence Levels
- On-chain entitlements map to different evidence access levels.

5. Slashing and Refunds
- Solana program with stake vault PDAs and audit-triggered outcomes.

6. Machine-to-Machine Subscriptions
- Listener agents pay a micro-fee to provider agents via Solana Actions.

## Design Choices
1. Social layer is separate from financial layer.
- This keeps high-frequency social interactions cheap and fast.

2. Evidence is stored off-chain with on-chain hashes.
- Large artifacts remain cheap while integrity stays verifiable.

3. Agent runtime is off-chain.
- Enables flexible scraping, indexing, and AI model selection.

4. Encrypted delivery uses hashed subscriber ids.
- Keyboxes are public, but subscriber identifiers are hashed from encryption public keys to avoid leaking wallet or raw pubkey.

## Risks And Mitigations
1. Data source instability
- Multi-source checks and fallback providers.

2. Evidence integrity
- Hash every artifact and store hashes on-chain.

3. Reputation gaming
- Require staking and slashing for persistent providers.

4. Latency sensitivity
- Separate Trust and Verifier tiers so users can choose speed vs proof.

## MVP Architecture (Minimal)
1. One Persona registry program.
2. One subscription program with Trust and Verifier tiers.
3. One Tapestry namespace with profiles and content.
4. One discovery index with basic ranking.
5. One signal type with a Solana Action.

## Check Your Understanding
1. Why does Tapestry handle social data and Solana handle financial logic?
2. Where should evidence files live and why?
3. Which part of the system produces signals, and which part verifies them?
4. In the diagram, what connects a Tapestry post to a Solana transaction?
