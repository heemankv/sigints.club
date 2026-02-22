# End-to-End Website Flow (MVP)
Project: sigints.club
Date: 2026-02-20

## Goal
Provide a concrete, detailed end-to-end example of how the **feed-first** website works with 3 makers and 10 listeners, including social discovery + on-chain subscriptions.

## Actors
- Makers (3):
  1. Maker A: Stream "ETH-Price Scout"
  2. Maker B: Stream "Amazon-Deal Scout"
  3. Maker C: Stream "Anime-Release Scout"

- Listeners (10): L1–L10

## Streams and Pricing Menus (Maker-Defined)
Each maker chooses **monthly subscription** tiers only (MVP enforcement). Evidence level (Trust vs Verifier) is layered on top.

### Stream A: ETH-Price Scout
- Domain: pricing
- Signal: best ETH price across 5 venues
- Pricing menu:
  1. Monthly Trust: 0.02 SOL/month (fast access)
  2. Monthly Verifier: 0.05 SOL/month (evidence access)

### Stream B: Amazon-Deal Scout
- Domain: e-commerce
- Signal: product + card + coupon stacking
- Pricing menu:
  1. Monthly Trust: 0.03 SOL/month
  2. Monthly Verifier: 0.08 SOL/month

### Stream C: Anime-Release Scout
- Domain: media
- Signal: new episode release timestamps
- Pricing menu:
  1. Monthly Trust: 0.01 SOL/month
  2. Monthly Verifier: 0.02 SOL/month

## Listener Subscription Matrix (10 listeners)
| Listener | Stream | Tier | Evidence Level | Reason |
| --- | --- | --- | --- | --- |
| L1 | ETH-Price Scout | Monthly Trust | Trust | Low cost, fast alerts |
| L2 | ETH-Price Scout | Monthly Verifier | Verifier | Needs proof for trading |
| L3 | ETH-Price Scout | Monthly Trust | Trust | Budget-friendly |
| L4 | Amazon-Deal Scout | Monthly Trust | Trust | Casual price hunter |
| L5 | Amazon-Deal Scout | Monthly Verifier | Verifier | Only trusts verified deals |
| L6 | Anime-Release Scout | Monthly Trust | Trust | Always-on release alerts |
| L7 | Anime-Release Scout | Monthly Verifier | Verifier | Wants proof timestamps |
| L8 | ETH-Price Scout | Monthly Trust | Trust | On-demand strategy bot |
| L9 | Amazon-Deal Scout | Monthly Trust | Trust | Shared household savings |
| L10 | ETH-Price Scout | Monthly Verifier | Verifier | Institutional bot |

---

## Phase 1: Feed‑First Discovery
1. Visitors land on homepage and see **recent intents + trending posts**.
2. The **Feed** is the primary surface (composer + filters).
3. L3 posts an intent: “ETH best price every minute. Max latency 3s.”
4. L7 posts an intent: “Anime episode release alerts with timestamps.”
5. Makers browse intents and see demand in real-time.

## Phase 2: Maker Setup and Stream Creation
6. Maker A creates "ETH-Price Scout":
   - Registers stream + tiers on-chain.
   - Stream appears in discovery grid.
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
