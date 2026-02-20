# End-to-End Website Flow (MVP)
Project: Persona.fun
Date: 2026-02-20

## Goal
Provide a concrete, detailed end-to-end example of how the **feed-first** website works with 3 makers and 10 listeners, including social discovery + on-chain subscriptions.

## Actors
- Makers (3):
  1. Maker A: Persona "ETH-Price Scout"
  2. Maker B: Persona "Amazon-Deal Scout"
  3. Maker C: Persona "Anime-Release Scout"

- Listeners (10): L1–L10

## Personas and Pricing Menus (Maker-Defined)
Each maker chooses which pricing options exist. Evidence level is layered on top.

### Persona A: ETH-Price Scout
- Domain: pricing
- Signal: best ETH price across 5 venues
- Pricing menu:
  1. Subscription-limited: $5/month, 200 signals (Trust)
  2. Subscription-unlimited: $15/month, fair-use (Verifier)
  3. Per-signal: $0.02 per signal (Trust)

### Persona B: Amazon-Deal Scout
- Domain: e-commerce
- Signal: product + card + coupon stacking
- Pricing menu:
  1. Subscription-limited: $8/month, 50 signals (Trust)
  2. Per-signal: $0.10 per signal (Verifier)

### Persona C: Anime-Release Scout
- Domain: media
- Signal: new episode release timestamps
- Pricing menu:
  1. Subscription-unlimited: $2/month (Trust)
  2. Per-signal: $0.01 per signal (Verifier)

## Listener Subscription Matrix (10 listeners)
| Listener | Persona | Pricing Type | Evidence Level | Reason |
| --- | --- | --- | --- | --- |
| L1 | ETH-Price Scout | Subscription-limited | Trust | Low cost, enough signals |
| L2 | ETH-Price Scout | Subscription-unlimited | Verifier | Needs proof for trading |
| L3 | ETH-Price Scout | Per-signal | Trust | Only wants rare alerts |
| L4 | Amazon-Deal Scout | Subscription-limited | Trust | Casual price hunter |
| L5 | Amazon-Deal Scout | Per-signal | Verifier | Only pays on real deals |
| L6 | Anime-Release Scout | Subscription-unlimited | Trust | Always-on release alerts |
| L7 | Anime-Release Scout | Per-signal | Verifier | Wants proof timestamps |
| L8 | ETH-Price Scout | Per-signal | Trust | On-demand strategy bot |
| L9 | Amazon-Deal Scout | Subscription-limited | Trust | Shared household savings |
| L10 | ETH-Price Scout | Subscription-unlimited | Verifier | Institutional bot |

---

## Phase 1: Feed‑First Discovery
1. Visitors land on homepage and see **recent intents + trending posts**.
2. The **Feed** is the primary surface (composer + filters).
3. L3 posts an intent: “ETH best price every minute. Max latency 3s.”
4. L7 posts an intent: “Anime episode release alerts with timestamps.”
5. Makers browse intents and see demand in real-time.

## Phase 2: Maker Setup and Persona Creation
6. Maker A creates "ETH-Price Scout":
   - Registers persona + tiers on-chain.
   - Persona appears in discovery grid.
7. Maker B and C repeat similarly.

## Phase 3: Listener Subscriptions
8. Listeners connect wallet and generate encryption keypair.
9. From feed, a listener clicks **Subscribe** (modal opens).
10. Listener chooses tier and confirms **wallet-signed on-chain subscribe**.
11. Subscription NFT is minted to listener’s wallet.

## Phase 4: Signal Generation
12. Maker A detects ETH best price.
13. Maker B detects card + coupon stack.
14. Maker C detects new episode release.

## Phase 5: Signal Delivery (Hybrid Encryption)
15. Maker encrypts each signal once with symmetric key.
16. Ciphertext stored in backend storage.
17. Maker encrypts symmetric key per subscriber (keybox).
18. Keybox stored off-chain.
19. On-chain `record_signal` stores:
    - `signal_hash`
    - `signal_pointer_hash`
    - `keybox_hash`
    - `keybox_pointer_hash`
    - `created_at`

## Phase 6: Listener Consumption
20. Listeners poll or subscribe via SDK/MCP.
21. SDK resolves pointer hashes to backend storage.
22. Listener decrypts signal with private key.

## Phase 7: Actions and Outcomes
23. Trust listeners act immediately.
24. Verifier listeners inspect evidence (when applicable).
25. Listener agents trigger downstream automation (trading, alerts, Pomodoro).

## Phase 8: Challenge and Slashing (Future)
26. Slash reports can be posted socially.
27. On-chain slashing flow is planned but not yet wired to UI.
