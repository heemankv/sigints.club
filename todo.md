# TODO

Open
1. Define exact tier object fields and defaults in on-chain schema.
2. Finalize PDA account layouts and sizes for each program.
3. Draft instruction arguments for create_stream, subscribe, open_challenge, slash.
4. Evaluate DA layer swap for evidence storage (future).
5. Redeploy updated subscription_royalty program (Token-2022 soulbound NFT + keybox gating).
6. Reset localnet and redeploy programs to fix on-chain demo seeding (AccountNotSigner).

Completed
1. Implement backend storage for ciphertext and keybox with hash verification.
2. Build minimal discovery index with weighted ranking.
3. Implement provider agent MVP for ETH best price signal.
4. Implement listener agent polling flow.
5. Build Tapestry integration for profiles, requests, and signal posts.
6. Create end-to-end demo flow with one Stream and two subscribers.
7. Verify record_signal on devnet from publish flow and capture tx.
8. UI redesign to match introduction site and wallet login/profile pages.
9. Subscription now mints an on-chain 1-of-1 NFT and profile reads subscriptions from chain.
10. Wallet-signed on-chain subscribe flow in the frontend (no backend signer).
11. SDK and MCP server scaffolding for agent signal listening.
12. Tapestry social feed + intent/slash posts integrated into UI.
13. Auto-create Tapestry profiles on login (when API key present).
14. Demo data seeding with backend + optional localnet on-chain seed flag.
15. Align codebase with sigints.club protocol: branding (non-landing pages), public vs private streams, monthly-only pricing, intent-first UX, SDK/MCP parity.
16. Add public signal path (no keybox) + on-chain allow record without subscribers for public.
17. Remove per-signal and limited tiers from UI/backend validation.
18. Update tests to cover public stream signals and monthly-only subscriptions.
19. Enforce soulbound subscription NFTs (Token-2022 non-transferable) + keybox access gating by NFT ownership.
20. Update SDK + MCP docs for keybox auth (wallet signature required for private stream signals).
