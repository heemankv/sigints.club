# Plan 2: Public Listening With Subscription Gating

## Goal
Public streams are plaintext (no encryption), but only subscribed users can access the payload. This means public streams are still gated by the subscription NFT.

## Current Behavior (Baseline)
- Public signals are stored in plaintext under `backend://public/<hash>`.
- Anyone can fetch `/storage/public/:sha`.
- Listener can observe on-chain `signal_latest` PDA events.

## Target Behavior
- Anyone can see that a public signal exists on-chain.
- Only subscribed users (holding the soulbound NFT) can fetch the plaintext payload.
- Agents can fetch payload if delegated by a subscribed user.

## Protocol (On-Chain) Changes
No new on-chain instructions required for public listening.  
However, we will rely on the existing subscription NFT and on-chain subscription account for gating.

## Backend Changes
1. Change `/storage/public/:sha` to require auth:
   - Accept either:
     - `wallet + signature`, or
     - `agent + signature` with delegation.
2. Validate access by checking:
   - Active subscription account for `(stream, wallet)`
   - Subscription NFT is held by wallet
   - Subscription not expired
3. If agent auth:
   - Verify agent signature
   - Verify agent delegation to this stream
   - Map agent to owning wallet (agent owner)
4. Add a lightweight metadata endpoint:
   - `GET /signals/by-hash/:hash` stays public (contains no payload)
   - Payload fetch stays gated

## SDK Changes
1. Add `fetchPublicPayload` that can authenticate:
   - `wallet + signature` path
   - `agent + signature` path
2. Update `SigintsClient.decryptSignal`:
   - When visibility is public, call gated fetch.
3. Ensure SDK owns all network logic:
   - All backend requests and on-chain verification inputs are made via SDK APIs.
   - Frontend must only call SDK methods (no direct backend/chain calls).
   - This ensures MCP servers can perform identical flows via SDK.

## Frontend Changes (UX/UI)
1. Public stream UI still shows in discovery.
2. When a user tries to view public payload:
   - If subscribed, fetch and display.
   - If not subscribed, show “Subscribe to access signals.”
3. Agent view:
   - Agents may list public streams.
   - Access still requires delegation + subscription.
4. Frontend is a dumb UI:
   - No direct backend or chain calls.
   - Uses SDK methods for all operations.

## Tests
1. Backend:
   - Public payload fetch requires subscription NFT.
   - Unsubscribed wallet gets 403.
2. Agent:
   - Delegated agent can fetch payload for owner.
   - Non-delegated agent blocked.

## Important Note
We cannot prevent anyone from observing the on-chain `signal_latest` PDA updates.  
Gating applies at payload access time (`/storage/public/:sha`), not at RPC event time.

## Execution Order
1. Backend auth/gating for public payload fetch
2. SDK update to include auth in public fetch
3. Frontend UI messaging for gated public payloads
