# TODO

Open
1. Define exact tier object fields and defaults in on-chain schema.
2. Finalize PDA account layouts and sizes for each program.
3. Draft instruction arguments for create_persona, subscribe, open_challenge, slash.
4. Pull Tapestry feed into the UI and auto-create Tapestry profiles on login (optional).
5. Evaluate DA layer swap for evidence storage (future).

Completed
1. Implement backend storage for ciphertext and keybox with hash verification.
2. Build minimal discovery index with weighted ranking.
3. Implement provider agent MVP for ETH best price signal.
4. Implement listener agent polling flow.
5. Build Tapestry integration for profiles, requests, and signal posts.
6. Create end-to-end demo flow with one Persona and two subscribers.
7. Verify record_signal on devnet from publish flow and capture tx.
8. UI redesign to match introduction site and wallet login/profile pages.
9. Subscription now mints an on-chain 1-of-1 NFT and profile reads subscriptions from chain.
10. Wallet-signed on-chain subscribe flow in the frontend (no backend signer).
11. SDK and MCP server scaffolding for agent tick listening.
