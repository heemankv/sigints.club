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
16. Devnet programs deployed and persona PDAs created; SOLANA_PERSONA_MAP now maps persona IDs to on-chain PDAs.
17. MVP uses backend wallet to sign on-chain subscriptions; UI exposes on-chain subscribe for demo.
18. Frontend UI is now aligned with the introduction design system (colors, typography, layout).
19. Wallet-based login registers user profiles and powers profile/bot/subscription views.
20. Tapestry integration is implemented via SocialFi client and optional signal posting.
21. Subscriptions now mint an on-chain 1-of-1 NFT (decimals 0) per subscription; UI reads subscriptions from chain (no DB storage).
22. One wallet holds at most one subscription per persona (no multi-tier subscriptions for the same persona).
23. Subscription NFT transferability is undecided; revisit later (possible Token-2022 non-transferable).
24. Next protocol version should require Tapestry as a first-class dependency: all discovery must be social, requests must be Tapestry posts, and all profiles must be on Tapestry.
25. On-chain subscribe is now wallet-signed in the UI; profile reads subscriptions directly from chain (no backend storage).
26. Keybox stored as a map (subscriber_id -> wrapped_key) so listeners decrypt only their own entry.
27. SDK and MCP server added for agent tick listening (Solana + backend pointers).
28. Signal `created_at` is now anchored on-chain via Solana Clock sysvar (stored in ms) to prevent maker backdating.
