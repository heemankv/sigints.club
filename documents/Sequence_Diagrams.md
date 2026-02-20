# Sequence Diagrams (Current Code)
Date: 2026-02-20

These diagrams reflect how the code works today (frontend, backend, programs, SDK, MCP).

---

## 1) User Onboarding + Role Choice
```mermaid
sequenceDiagram
  actor User
  participant UI as Frontend UI
  participant Wallet
  participant API as Backend API
  participant Store as User Store

  User->>UI: Open app
  User->>Wallet: Connect wallet
  Wallet-->>UI: Public key
  UI->>API: POST /users/login
  API->>Store: Upsert user profile
  Store-->>API: User profile
  API-->>UI: User profile

  alt User chooses Maker
    UI->>API: POST /bots (role=maker, personaId, tiers)
    API->>Store: Create bot
    Store-->>API: Bot record
    API-->>UI: Bot created
  else User chooses Listener
    UI->>API: POST /bots (role=listener)
    API->>Store: Create bot
    Store-->>API: Bot record
    API-->>UI: Bot created
  end
```

---

## 2) Social Feed (All + Following)
```mermaid
sequenceDiagram
  actor User
  participant UI as Frontend UI
  participant API as Backend API
  participant Social as Social Service
  participant Tapestry

  User->>UI: Open Feed
  UI->>API: GET /social/feed?type=all
  API->>Social: listPostsWithCounts
  Social->>Tapestry: listContents(type=intent/slash)
  Tapestry-->>Social: posts + socialCounts
  Social-->>API: posts + likeCounts + commentCounts
  API-->>UI: render feed

  alt Following feed
    UI->>API: GET /social/feed?scope=following&wallet=...
    API->>Social: listFollowingPosts
    Social->>Tapestry: listFollowing(profileId)
    Social->>Tapestry: listContents(profileId) for each follow
    Tapestry-->>Social: posts + socialCounts
    Social-->>API: posts + counts
    API-->>UI: render following feed
  end
```

---

## 3) Intent Post + Engagement
```mermaid
sequenceDiagram
  actor User
  participant UI as Frontend UI
  participant API as Backend API
  participant Social as Social Service
  participant Tapestry

  User->>UI: Write intent
  UI->>API: POST /social/intents
  API->>Social: createIntent
  Social->>Tapestry: ensureProfile
  Social->>Tapestry: createContent(type=intent)
  Tapestry-->>API: contentId
  API-->>UI: intent created

  alt Like
    User->>UI: Like
    UI->>API: POST /social/likes
    API->>Tapestry: createLike
    Tapestry-->>UI: like ack
  end

  alt Comment
    User->>UI: Comment
    UI->>API: POST /social/comments
    API->>Tapestry: createComment
    Tapestry-->>UI: comment ack
  end
```

---

## 4) On-chain Subscribe (NFT Mint)
```mermaid
sequenceDiagram
  actor Listener
  participant UI as Frontend UI
  participant Wallet
  participant RPC as Solana RPC
  participant Registry as Persona Registry
  participant SubProg as Subscription Program

  Listener->>UI: Click Subscribe (from feed or persona)
  UI->>Wallet: Sign transaction
  Wallet-->>UI: Signed tx
  UI->>RPC: Submit tx
  SubProg->>Registry: Validate persona + tier
  SubProg-->>RPC: Mint subscription NFT to subscriber
  RPC-->>UI: Signature
```

---

## 5) Signal Publish + Hybrid Encryption
```mermaid
sequenceDiagram
  actor Maker
  participant Agent as Provider Agent
  participant API as Backend API
  participant Store as Storage
  participant SubProg as Subscription Program
  participant RPC as Solana RPC

  Maker->>Agent: Detect new signal
  Agent->>API: POST /signals (plaintext)
  API->>Store: Store ciphertext + keybox
  API->>SubProg: record_signal (hashes + pointer hashes)
  SubProg-->>RPC: SignalRecord created
  API-->>Agent: metadata
```

---

## 6) SDK + MCP Listening
```mermaid
sequenceDiagram
  actor Agent
  participant SDK
  participant RPC as Solana RPC
  participant API as Backend API
  participant MCP

  Agent->>SDK: listenForSignals
  SDK->>RPC: subscribe program accounts
  RPC-->>SDK: SignalRecord update
  SDK->>API: GET /signals/by-hash
  SDK->>API: GET /storage/ciphertext + /keybox
  SDK-->>Agent: decrypted plaintext

  Agent->>MCP: listen_persona_ticks
  MCP->>SDK: listenForSignals
  SDK-->>MCP: decrypted tick
  MCP-->>Agent: streaming notification
```
