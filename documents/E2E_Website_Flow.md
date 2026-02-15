# End-to-End Website Flow (MVP)
Project: Persona.fun
Date: 2026-02-15

## Goal
Provide a concrete, detailed end-to-end example of how the website works with 3 makers and 10 listeners using different subscription combinations.

## Actors
- Makers (3):
  1. Maker A: Persona "ETH-Price Scout"
  2. Maker B: Persona "Amazon-Deal Scout"
  3. Maker C: Persona "Anime-Release Scout"

- Listeners (10): L1–L10

## Personas and Pricing Menus (Maker-Defined)
Each maker chooses which pricing options exist. Trust vs Verifier is an evidence level that can be layered on any pricing option.

### Persona A: ETH-Price Scout
- Domain: pricing
- Signal: best ETH price across 5 venues
- Pricing menu:
  1. Subscription-limited: $5/month, 200 signals (Trust)
  2. Subscription-unlimited: $15/month, fair-use (Verifier)
  3. Per-signal: $0.02 per signal (Trust)

### Persona B: Amazon-Deal Scout
- Domain: e-commerce
- Signal: specific product + card + coupon stacking
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

## Website Flow: End-to-End Walkthrough

### Phase 1: Discovery and Requests
1. Visitors land on the homepage.
2. The discovery index shows Personas ranked by accuracy, latency, evidence score, and price.
3. A "Requests" tab shows open subscription requests.
4. L3 posts a request: "ETH best price across 5 venues every minute. Max latency 3s."
5. L7 posts a request: "Anime episode release alerts with timestamps."
6. Makers see demand in the request feed.

### Phase 2: Maker Setup and Persona Creation
7. Maker A creates "ETH-Price Scout".
   - Creates a Tapestry profile (Persona identity).
   - Sets pricing tiers and evidence levels in the registry program.
8. Maker B creates "Amazon-Deal Scout".
9. Maker C creates "Anime-Release Scout".

### Phase 3: Listener Subscriptions
10. Each listener connects wallet and creates an encryption keypair.
11. Subscription UI shows maker-defined menu options.
12. Listener selects a tier and evidence level.
13. On-chain subscription record is created.
14. Listener’s encryption pubkey is registered; subscriber_id is hash(pubkey).

### Phase 4: Signal Generation
15. Maker A’s agent detects ETH best price.
16. Maker B’s agent detects a card + coupon stack.
17. Maker C’s agent detects new episode release.

### Phase 5: Signal Delivery (Hybrid Encryption)
18. Maker encrypts each signal once with symmetric key.
19. Ciphertext stored in backend storage.
20. Maker encrypts symmetric key per subscriber and builds keybox.
21. Keybox stored off-chain.
22. On-chain signal record posted with:
   - signal_hash
   - signal_pointer
   - keybox_hash
   - keybox_pointer
   - tier_id

### Phase 6: Listener Consumption
23. Listeners poll new signals.
24. Each listener finds their keybox entry using subscriber_id.
25. Listener decrypts symmetric key, fetches ciphertext, verifies hash, decrypts signal.

### Phase 7: Actions and Outcomes
26. Trust subscribers act immediately (fast signals).
27. Verifier subscribers inspect evidence artifacts before acting.
28. Listener bots trigger automated workflows:
   - L2 and L10 trigger trading logic.
   - L5 checks Amazon logs before purchase.
   - L6 triggers a Pomodoro break.

### Phase 8: Challenge and Slashing
29. If a verifier finds an incorrect signal, they open a challenge.
30. Audit agent checks evidence.
31. If wrong, stake is slashed and refunds issued.

## End-to-End Example Sequence
### Example: ETH-Price Scout
1. Maker A posts signal: "Best ETH price at Venue X." (Trust + Verifier)
2. L1 and L3 act immediately.
3. L2 and L10 check evidence logs.
4. L2 finds evidence mismatch and challenges.
5. Audit confirms error. Maker A is slashed. Refunds issued.

### Example: Amazon-Deal Scout
1. Maker B posts signal: "ICICI + coupon stack reduces price to $420." (Verifier)
2. L5 checks logs and confirms.
3. L4 and L9 act quickly on trust subscription.

### Example: Anime-Release Scout
1. Maker C posts signal: "New episode released at 9:00 PM IST." (Trust + Verifier)
2. L6’s Pomodoro agent schedules break.
3. L7 verifies timestamp from official release page.

## What The Website Shows
1. Discovery index with filters by domain and evidence level.
2. Persona profile pages with tiers and evidence requirements.
3. Subscription request feed with pricing offers.
4. Signal feed with Actions (Blinks) for payment and execution.
5. Challenge panel for verifier subscribers.

## What This Proves (Hackathon Value)
1. Shared compute prevents redundant scanning.
2. Maker-defined pricing menu supports multiple business models.
3. Hybrid encryption protects premium signals.
4. Tapestry provides social graph and discovery.
5. Solana enforces payments, staking, and slashing.

## Exercises (Check Understanding)
1. Why do L2 and L10 choose Verifier tiers?
2. Which listeners use per-signal pricing, and why?
3. In this flow, where does the on-chain record get written?
4. How does the keybox let each listener decrypt only their own key?
