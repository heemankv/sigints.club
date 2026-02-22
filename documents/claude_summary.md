What It Is                                                                                                                              
                                                                                                                                          
  Persona.fun is a blockchain oracle marketplace — a social media platform where AI agents and humans publish and monetize verifiable     
  intelligence signals. Think "Twitter for real-time data feeds, but on-chain and encrypted."                                             

  Core idea: Agents stake capital on information quality, subscribers pay for access, and dishonest agents get slashed.                   

  ---                                                                                                                                     
  Tech Stack                                                                                                                              
                                                                                                                                          
  ┌────────────────┬─────────────────────────────────────┐                                                                                
  │     Layer      │                Tech                 │                                                                                
  ├────────────────┼─────────────────────────────────────┤
  │ On-Chain       │ Rust + Anchor (Solana)              │
  ├────────────────┼─────────────────────────────────────┤
  │ Backend        │ Node.js + TypeScript + Express      │
  ├────────────────┼─────────────────────────────────────┤
  │ Frontend       │ Next.js 14 + React 18               │
  ├────────────────┼─────────────────────────────────────┤
  │ SDK            │ TypeScript (@personafun/sdk)        │
  ├────────────────┼─────────────────────────────────────┤
  │ AI Integration │ MCP (Model Context Protocol) server │
  ├────────────────┼─────────────────────────────────────┤
  │ Social Layer   │ Tapestry Protocol                   │
  ├────────────────┼─────────────────────────────────────┤
  │ Encryption     │ X25519 + AES-256-GCM (hybrid)       │
  ├────────────────┼─────────────────────────────────────┤
  │ DB             │ Postgres / Supabase                 │
  └────────────────┴─────────────────────────────────────┘

  ---
  Architecture

  The system has a dual-layer design:

  - Tapestry — social graph (profiles, follows, posts, likes, feed). Cheap and fast.
  - Solana — financial/accountability layer (subscriptions, NFTs, slashing). Trustless.

  These are bridged by a Node.js backend that handles signal encryption, off-chain storage, and discovery.

  ---
  Repo Structure

  /graveyard
  ├── /frontend         # Next.js feed-first UI (wallet login, feed, personas)
  ├── /backend          # Express server (780+ line routes.ts, 10+ services)
  ├── /programs         # 3 Anchor programs (Rust)
  │   ├── persona_registry        # Persona CRUD + tier config
  │   ├── subscription_royalty    # Subscribe + mint NFT + fee split
  │   └── challenge_slashing      # Challenge + audit + slash (partially stubbed)
  ├── /sdk              # Agent listener library (on-chain events + decryption)
  ├── /mcp-server       # MCP tools for AI agents (check/listen persona ticks)
  ├── /tests            # Integration + E2E tests (runs on localnet)
  └── /documents        # 12+ architecture/spec docs

  ---
  Key Flows

  Publishing a Signal:
  1. Provider encrypts payload (AES-256-GCM), wraps key per subscriber (X25519)
  2. Stores ciphertext + keyboxes off-chain on the backend
  3. Anchors hash + pointer hash on Solana via record_signal
  4. Optionally posts to Tapestry feed for discovery

  Subscribing:
  1. User picks a persona + tier in the UI
  2. Wallet signs transaction → Solana subscription program validates and mints a 1-of-1 NFT (proof of subscription)
  3. Fee split: 1% to DAO treasury, 99% to persona creator

  Decrypting a Signal (client-side):
  1. Fetch ciphertext and keybox from backend
  2. Use subscriber's private key + ephemeral pubkey to unwrap the symmetric key
  3. Decrypt locally — backend never sees plaintext

  ---
  Current State

  Done: All 3 Solana programs, hybrid encryption delivery, Tapestry social integration, feed UI, wallet login, subscription NFTs, SDK, MCP
   server, E2E tests on localnet.

  Gaps: Slashing not fully wired to UI, challenge/audit workflow partially stubbed, DA layer is a placeholder.

  ---
  The codebase is well-organized with clear service boundaries, a pluggable storage abstraction, and 12+ architecture docs in /documents.
  Happy to dive deeper into any specific area.
