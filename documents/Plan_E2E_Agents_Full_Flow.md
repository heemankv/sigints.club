# Plan: Full E2E Agents Flow (Localnet, SDK-Only)

## Goal
Prove end-to-end signal flow across all three new plans using a single SDK-driven test on localnet.

## Actors
- Users: U1, U2, U3, U4, U5
- Streams: S_private (owner U1), S_public (owner U2)
- Publisher agents: A1_pub (U1), A2_pub (U2)
- Listener agents: A3_list (U3), A4_list (U4), A5_list (U5)

## Preconditions
- Localnet running via `run-chain`
- Backend running (standalone or via `run-app.sh`)
- Programs deployed and env vars set

## End-to-End Flow
1. Create 5 user keypairs from accounts.
2. Airdrop SOL to all users.
3. Create S_private (U1) on-chain and in backend.
4. Create S_public (U2) on-chain and in backend.
5. Configure tier for each stream on-chain.
6. U1 subscribes to S_public (price 0) to unlock agent creation.
7. U2 subscribes to S_private (price > 0) to unlock agent creation.
8. U1 registers subscription key for S_private and syncs to backend.
9. U3 subscribes to S_public (no key required for public subscribe).
10. U3 creates listener agent A3_list.
11. U3 attempts to subscribe to S_private without a subscription key and must fail.
12. U3 registers subscription key for S_private and syncs to backend.
13. U3 subscribes to S_private and links A3_list to S_private and S_public.
14. U4 and U5 register subscription keys for S_private, subscribe to both, and link agents.
16. U1 creates publisher agent A1_pub, grants on-chain delegation for S_private.
17. U2 creates publisher agent A2_pub, grants on-chain delegation for S_public.
18. Failure case: a non-subscribed wallet or agent tries to fetch S_public payload and must fail.
19. Failure case: an unlinked agent tries to fetch S_private keybox and must fail.
20. Start publishers: A1_pub and A2_pub publish 5 signals each, every 10s.
21. Start listeners: A3_list, A4_list, A5_list listen to both streams.
22. Verify each listener receives 5 signals per stream and private payloads decrypt.

## Pass Criteria
- Delegated publishers record signals on-chain for both streams.
- Public payload access is blocked without an active subscription NFT.
- Private keybox access is blocked for agents without stream linkage.
- Listeners decrypt private signals using per-stream subscription keys.
- Each listener receives exactly 5 signals from each stream.

## Implementation Notes
- Use SDK-only flows (no direct backend or chain calls outside SDK helpers).
- Use `SigintsClient.listenForSignals` with `agentAuth` for listener agents.
- Use per-stream subscription keys for private streams.
- Use `buildRecordSignalDelegatedInstruction` for publisher agents.
