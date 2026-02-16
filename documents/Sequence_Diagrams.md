# Sequence Diagrams (Current Code)
Date: 2026-02-15

These diagrams reflect how the code works today (frontend, backend, programs, SDK, MCP). Optional branches are shown with `alt` blocks.

**1) User Onboarding + Role Choice**
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
  UI->>API: POST /users/login (wallet, displayName?, bio?)
  API->>Store: Upsert user profile
  Store-->>API: User profile
  API-->>UI: User profile

  alt User chooses Maker
    UI->>API: POST /bots (role=maker, personaId, tiers, ownerWallet)
    API->>Store: Create bot record
    Store-->>API: Bot record
    API-->>UI: Bot created
  else User chooses Listener
    UI->>API: POST /bots (role=listener, personaId?, ownerWallet)
    API->>Store: Create bot record
    Store-->>API: Bot record
    API-->>UI: Bot created
  end
```

**2) Maker Persona Registration (On-chain Registry)**
```mermaid
sequenceDiagram
  actor MakerAdmin as Maker Admin
  participant Script as create-personas script
  participant RPC as Solana RPC
  participant Registry as Persona Registry Program
  participant Env as .env file

  MakerAdmin->>Script: Run personas:create
  Script->>RPC: Derive persona PDA
  Script->>Registry: create_persona (persona_id, tiers_hash, dao)
  Registry-->>RPC: Persona PDA created
  Script->>Env: Update SOLANA_PERSONA_MAP
```

**3) Maker Bot Registration + Optional Social Profile**
```mermaid
sequenceDiagram
  actor Maker
  participant UI as Frontend UI
  participant API as Backend API
  participant Store as Bot Store
  participant Tapestry

  Maker->>UI: Create maker bot
  UI->>API: POST /bots (role=maker, personaId, tiers)
  API->>Store: Create bot record
  Store-->>API: Bot record
  API-->>UI: Bot created

  alt Tapestry keys configured
    API->>Tapestry: Create or fetch profile
    Tapestry-->>API: Profile id
  end
```

**4) Discovery + Feed**
```mermaid
sequenceDiagram
  actor User
  participant UI as Frontend UI
  participant API as Backend API
  participant Discovery as Discovery Service

  User->>UI: Open Feed or Search
  UI->>API: GET /feed OR GET /bots?search=&role=
  API->>Discovery: listSignals + listBots
  Discovery-->>API: Feed entries
  API-->>UI: Feed list
```

**4B) Social Intent Post**
```mermaid
sequenceDiagram
  actor User
  participant UI as Frontend UI
  participant API as Backend API
  participant Social as Social Service
  participant Tapestry
  participant Store as Social Post Store

  User->>UI: Write intent + post
  UI->>API: POST /social/intents
  API->>Social: createIntent
  Social->>Tapestry: create profile (if missing)
  Tapestry-->>Social: profileId
  Social->>Tapestry: create content (type=intent)
  Tapestry-->>Social: contentId
  Social->>Store: index post (contentId)
  Store-->>API: post record
  API-->>UI: post + updated feed
```

**4C) Slash Report + Votes + Comments**
```mermaid
sequenceDiagram
  actor Validator
  participant UI as Frontend UI
  participant API as Backend API
  participant Social as Social Service
  participant Tapestry

  Validator->>UI: Submit slash report
  UI->>API: POST /social/slash
  API->>Social: createSlashReport
  Social->>Tapestry: create content (type=slash)
  Tapestry-->>Social: contentId
  API-->>UI: slash post created

  alt Vote
    Validator->>UI: Vote to slash
    UI->>API: POST /social/likes
    API->>Tapestry: create like
    Tapestry-->>API: like ack
  end

  alt Comment
    Validator->>UI: Add comment/evidence
    UI->>API: POST /social/comments
    API->>Tapestry: create comment
    Tapestry-->>API: comment ack
  end

  alt Follow
    Validator->>UI: Follow author
    UI->>API: POST /social/follow
    API->>Tapestry: follow (startId -> endId)
    Tapestry-->>API: follow ack
  end
```

**4D) Trending Feed**
```mermaid
sequenceDiagram
  actor User
  participant UI as Frontend UI
  participant API as Backend API
  participant Social as Social Service
  participant Tapestry

  User->>UI: Open Trending
  UI->>API: GET /social/feed/trending
  API->>Social: list posts
  loop for each post
    Social->>Tapestry: get likes by contentId
    Tapestry-->>Social: likes
  end
  API-->>UI: posts sorted by like counts
```

**4E) Follow Maker From Persona Page**
```mermaid
sequenceDiagram
  actor User
  participant UI as Frontend UI
  participant API as Backend API
  participant Social as Social Service
  participant Tapestry

  User->>UI: Click "Follow Maker"
  UI->>API: POST /social/follow (targetProfileId)
  API->>Social: follow
  Social->>Tapestry: follow(startId, endId)
  Tapestry-->>Social: follow ack
  API-->>UI: success
```

**5) Key Generation + Off-chain Subscribe (Encryption Key)**
```mermaid
sequenceDiagram
  actor Listener
  participant UI as Frontend UI
  participant Crypto as Browser Crypto
  participant API as Backend API
  participant Dir as Subscriber Directory

  Listener->>UI: Generate keypair
  UI->>Crypto: generateX25519Keypair
  Crypto-->>UI: pubKey, privKey
  UI->>UI: Store keys in localStorage
  Listener->>UI: Register encryption key
  UI->>API: POST /subscribe (personaId, encPubKeyDerBase64)
  API->>Dir: addSubscriber
  Dir-->>API: stored
  API-->>UI: subscriberId
```

**6) On-chain Subscribe (NFT Mint + Persona Enforcement)**
```mermaid
sequenceDiagram
  actor Listener
  participant UI as Frontend UI
  participant Wallet
  participant RPC as Solana RPC
  participant SubProg as Subscription Program
  participant Registry as Persona Registry Program

  Listener->>UI: Subscribe on-chain
  UI->>Wallet: build + sign subscribe tx
  Wallet->>RPC: Send transaction
  RPC->>SubProg: subscribe
  SubProg->>Registry: Validate persona PDA
  SubProg->>SubProg: init Subscription PDA
  SubProg->>SubProg: create Mint + ATA via CPI
  SubProg->>SubProg: mint 1 NFT to subscriber ATA
  SubProg->>SubProg: increment persona_state.subscription_count
  RPC-->>UI: signature
```

**7) Maker Publish Signal (Event Loop)**
```mermaid
sequenceDiagram
  actor MakerAgent as Maker Agent
  participant API as Backend API
  participant SignalSvc as Signal Service
  participant Storage as Storage Provider
  participant RPC as Solana RPC
  participant SubProg as Subscription Program
  participant Registry as Persona Registry Program
  participant Tapestry

  loop Event loop (price scrape, news, etc.)
    MakerAgent->>API: POST /signals (personaId, tierId, plaintextBase64)
    API->>SignalSvc: encrypt + prepare keybox
    SignalSvc->>Storage: store ciphertext
    Storage-->>SignalSvc: signal pointer + hash
    SignalSvc->>Storage: store keybox
    Storage-->>SignalSvc: keybox pointer + hash
    SignalSvc->>RPC: record_signal tx
    RPC->>SubProg: record_signal
    SubProg->>Registry: validate persona PDA + authority
    SubProg->>SubProg: require persona_state.subscription_count > 0
    SubProg-->>RPC: signal account created
    RPC-->>API: on-chain tx signature
    alt Tapestry enabled
      API->>Tapestry: post content
      Tapestry-->>API: post id
    end
    API-->>MakerAgent: signal metadata
  end
```

**8) Listener Agent via SDK (On-chain Stream + Decrypt)**
```mermaid
sequenceDiagram
  actor ListenerAgent as Listener Agent
  participant SDK as Persona SDK
  participant RPC as Solana RPC
  participant API as Backend API
  participant Storage as Storage Provider

  ListenerAgent->>SDK: listenForSignals(personaId, keys)
  SDK->>RPC: onProgramAccountChange (signal accounts)
  RPC-->>SDK: signal account change
  SDK->>API: GET /signals/by-hash/:signalHash
  API-->>SDK: metadata (pointers + hashes)
  SDK->>API: GET /storage/keybox/:sha?subscriberId=
  API->>Storage: fetch keybox entry
  Storage-->>API: wrapped key
  API-->>SDK: wrapped key
  SDK->>API: GET /storage/ciphertext/:sha
  API->>Storage: fetch ciphertext
  Storage-->>API: ciphertext payload
  API-->>SDK: ciphertext payload
  SDK->>SDK: decrypt payload
  SDK-->>ListenerAgent: onSignal(tick)
```

**9) Listener via MCP Server (Long-running Listen Mode)**
```mermaid
sequenceDiagram
  actor AIClient as AI Client
  participant MCP as MCP Server
  participant SDK as Persona SDK
  participant RPC as Solana RPC
  participant API as Backend API
  participant Storage as Storage Provider

  AIClient->>MCP: listen_persona_ticks(personaId, keys)
  MCP->>SDK: listenForSignals
  SDK->>RPC: onProgramAccountChange
  RPC-->>SDK: signal change
  SDK->>API: fetch metadata + keybox + ciphertext
  API->>Storage: fetch entries
  Storage-->>API: payloads
  API-->>SDK: payloads
  SDK->>SDK: decrypt
  SDK-->>MCP: tick
  MCP-->>AIClient: streaming notification
```

**10) Frontend Decrypt (Manual)**
```mermaid
sequenceDiagram
  actor User
  participant UI as Frontend UI
  participant API as Backend API
  participant Storage as Storage Provider
  participant Crypto as Browser Crypto

  User->>UI: Open persona page
  User->>UI: Paste keys or use saved keys
  User->>UI: Click Decrypt
  UI->>API: GET /signals?personaId=
  API-->>UI: signal list
  UI->>API: GET /storage/keybox/:sha
  API->>Storage: fetch keybox
  Storage-->>API: keybox payload
  API-->>UI: keybox payload
  UI->>Crypto: derive shared key + unwrap symmetric key
  UI->>API: GET /storage/ciphertext/:sha
  API->>Storage: fetch ciphertext
  Storage-->>API: ciphertext payload
  API-->>UI: ciphertext payload
  UI->>Crypto: decrypt payload
  UI-->>User: plaintext
```

**11) On-chain Renew + Cancel**
```mermaid
sequenceDiagram
  actor Listener
  participant UI as Frontend UI
  participant Wallet
  participant RPC as Solana RPC
  participant SubProg as Subscription Program

  alt Renew
    Listener->>UI: Renew subscription
    UI->>Wallet: build + sign renew tx
    Wallet->>RPC: Send transaction
    RPC->>SubProg: renew
    SubProg->>SubProg: update expires/quota
    SubProg->>SubProg: increment persona_state if reactivated
    RPC-->>UI: signature
  else Cancel
    Listener->>UI: Cancel subscription
    UI->>Wallet: build + sign cancel tx
    Wallet->>RPC: Send transaction
    RPC->>SubProg: cancel
    SubProg->>SubProg: set status canceled
    SubProg->>SubProg: decrement persona_state if active
    RPC-->>UI: signature
  end
```

**12) Backend Listener Script (Non-SDK)**
```mermaid
sequenceDiagram
  actor ListenerScript as Listener Script
  participant API as Backend API
  participant Storage as Storage Provider
  participant ListenerSvc as Listener Service

  ListenerScript->>API: GET /signals?personaId=
  API-->>ListenerScript: signal list
  ListenerScript->>ListenerSvc: decryptLatestSignal
  ListenerSvc->>Storage: fetch ciphertext + keybox
  Storage-->>ListenerSvc: payloads
  ListenerSvc-->>ListenerScript: plaintext
```

**13) Provider Script (Non-UI Maker Agent)**
```mermaid
sequenceDiagram
  actor ProviderScript as Provider Script
  participant API as Backend API
  participant SignalSvc as Signal Service

  ProviderScript->>API: POST /subscribe (simulate subscribers)
  API-->>ProviderScript: subscriber IDs
  ProviderScript->>API: POST /signals (personaId, tierId, plaintextBase64)
  API->>SignalSvc: encrypt + store + on-chain record
  SignalSvc-->>API: metadata
  API-->>ProviderScript: metadata
```

If you want these reorganized into “MVP only” vs “Future/Tapestry-enabled,” tell me and I’ll split the document.
