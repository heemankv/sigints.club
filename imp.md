# Important Decisions and Discoveries
Date: 2026-02-15

1. Pricing model is maker-defined menu with options: subscription-limited, subscription-unlimited, per-signal. Taker chooses tier at subscription.
2. Trust vs Verifier are evidence levels, not pricing models; pricing can sit under either.
3. Posts are immutable; corrections are new posts.
4. Social layer uses Tapestry; financial logic uses Solana programs.
5. Evidence storage MVP uses backend storage with on-chain SHA-256 hash and pointer.
6. Hybrid encryption delivery: ciphertext stored off-chain, symmetric key encrypted per subscriber.
7. Subscriber id is hash of encryption public key; keybox can be public without leaking pubkey.
8. Registry, Subscription/Royalty, Slashing are three separate on-chain programs.
9. Discovery ranking uses weighted sum of accuracy, latency, evidence, and price.
10. MVP domain choice: ETH best price feed across sources.
11. On-chain programs will use Rust with Anchor for MVP.
12. Frontend will use Next.js.
13. Backend and agents will use Node.js with TypeScript.
14. Backend storage will use Postgres (Supabase) plus object storage for ciphertext and keyboxes.
15. Backend uses an Anchor client to submit `record_signal` on-chain when Solana env vars are set; testnet is the default cluster.
16. Devnet programs deployed and stream PDAs created; SOLANA_STREAM_MAP now maps stream IDs to on-chain PDAs.
17. MVP uses backend wallet to sign on-chain subscriptions; UI exposes on-chain subscribe for demo.
18. Frontend UI is now aligned with the introduction design system (colors, typography, layout).
19. Wallet-based login registers user profiles and powers profile/bot/subscription views.
20. Tapestry integration is implemented via SocialFi client and optional signal posting.
21. Subscriptions now mint an on-chain 1-of-1 NFT (decimals 0) per subscription; UI reads subscriptions from chain (no DB storage).
22. One wallet holds at most one subscription per stream (no multi-tier subscriptions for the same stream).
23. Subscription NFT transferability is undecided; revisit later (possible Token-2022 non-transferable).
24. Next protocol version should require Tapestry as a first-class dependency: all discovery must be social, requests must be Tapestry posts, and all profiles must be on Tapestry.
25. On-chain subscribe is now wallet-signed in the UI; profile reads subscriptions directly from chain (no backend storage).
26. Keybox stored as a map (subscriber_id -> wrapped_key) so listeners decrypt only their own entry.
27. SDK and MCP server added for agent tick listening (Solana + backend pointers).
28. Signal `created_at` is now anchored on-chain via Solana Clock sysvar (stored in ms) to prevent maker backdating.
29. Stream registry is enforced on-chain for subscribe and record_signal; only active registered streams can emit ticks.
30. Makers can only emit ticks when there is at least one active subscription (subscription count tracked on-chain; cancel decrements, renew reactivates).
31. Social layer is Tapestry-first: intents and slash reports are Tapestry posts, votes are likes, and comments are Tapestry comments; backend only indexes the feed.
32. Social feed now supports follows and trending (sorted by Tapestry like counts); slash posts can link to challenge tx.
33. Stream pages expose a Follow button (uses Tapestry profileId from stream map) and homepage shows Trending leaderboard.
34. Tapestry API expects `properties` for content/profile and `text` for comments; base URL now uses the fly.dev `/api/v1` host for successful requests.
35. Subscribe inputs are tier-derived in the UI; users select a tier, and pricing type / evidence / quota / expiry are not user-editable at subscribe time (revisit later).
36. On-chain subscribe now transfers lamports: a platform cut (1% = 100 bps) to stream `dao` and the remainder to stream `authority` (maker).
37. On-chain subscriber key registration is supported via `register_key` (SubscriberKey PDA) to bind X25519 pubkeys on-chain.
38. Default model is one-time wallet key registration (WalletKey PDA); subscriptions can reuse this key without per-subscription keypair generation.
39. Tier prices are now stored on-chain via stream_registry `TierConfig` PDAs and enforced during subscribe; price must match exactly.
40. Signal recording is latest-only: one `signal_latest` PDA per stream; each tick overwrites the same account (history kept off-chain).
41. Product name is now **sigints.club** (Signals Intelligence), not Stream.club.
42. Protocol focus: perishable alpha + strategic foresight signals; signals are streams, ticks are updates, intents are request posts.
43. Discovery and social posting remain Tapestry-first (intents and signal posts are Tapestry content).
44. Public signals are free and oracle-like (latest-only account). Private signals are encrypted and subscription-based.
45. Private signals are **monthly subscriptions only** (no per-signal or limited tiers for MVP).
46. Trust vs Verifiable are evidence modes for **private** signals; public signals are open.
47. Public signals skip keyboxes; payloads live in `/storage/public` and on-chain keybox hashes are zeroed.
48. Tapestry is mandatory for discovery and social; backend no longer falls back to local stores for stream lists or feeds.
