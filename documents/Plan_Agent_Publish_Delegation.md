# Plan 1: Agent-Delegated Publishing (One Agent -> One Stream)

## Goal
Allow an agent to publish signals to a single stream without ever holding the user’s wallet private key. The stream authority wallet delegates publish rights to a specific agent keypair. Delegation is enforced on-chain.

## Current Behavior (Baseline)
- `record_signal` requires the stream authority signer.  
- Any publish bot must use the authority private key to sign.

## Target Behavior
- The stream authority can delegate publishing to an agent public key for one stream.
- The agent signs `record_signal` with its own private key.
- On-chain logic enforces that the agent is authorized for that stream only.
- A single agent can publish to exactly one stream (enforced in backend + UI).

## Protocol (On-Chain) Changes
1. Add `publisher_delegate` account.
   - Seeds: `["publisher", stream_pubkey, agent_pubkey]`
   - Fields: `stream`, `agent`, `owner_wallet`, `status`, `created_at`
2. Add instructions in `stream_registry` (preferred) or `subscription_royalty`:
   - `grant_publisher(stream, agent_pubkey)`
   - `revoke_publisher(stream, agent_pubkey)`
3. Update `record_signal` in `subscription_royalty`:
   - Accept either:
     - `authority` signer that matches stream authority, or
     - `agent` signer + valid `publisher_delegate` PDA
4. Add checks:
   - `publisher_delegate.stream == stream`
   - `publisher_delegate.agent == agent_signer`
   - `publisher_delegate.status == active`

## Backend Changes
1. Extend agent model to include:
   - `agentPubkey`
   - `canPublish` flag or `role` set to `"publisher"` (but we should allow agents to both listen + publish)
   - `publishStreamId` (single stream)
2. New API routes:
   - `POST /agents/:id/grant-publisher`
     - Returns an unsigned transaction for wallet to sign OR accepts a signed tx.
   - `DELETE /agents/:id/revoke-publisher`
3. Enforce:
   - One agent can publish to only one stream.
   - Only the stream authority wallet can grant/revoke.
4. Optional:
   - Require agent signature on `/signals/prepare` to prevent spam.

## SDK Changes
1. Add instruction builders:
   - `buildGrantPublisherInstruction`
   - `buildRevokePublisherInstruction`
2. Add SDK helpers:
   - `grantAgentPublisher`
   - `revokeAgentPublisher`
3. Add agent metadata updates in SDK client:
   - store `agentPubkey`, `publishStreamId`
4. Ensure SDK owns all network logic:
   - All backend requests and on-chain transactions for delegation flow must be exposed in SDK APIs.
   - Frontend must only call SDK methods (no direct backend/chain calls).
   - This ensures MCP servers can perform identical flows via SDK.

## Frontend Changes (UX/UI)
1. Agent creation form:
   - Generate agent keypair client-side.
   - Show user the agent public key.
2. “Publishing Delegation” panel on stream page or agent page:
   - Select stream
   - Grant publish rights
   - Revoke publish rights
3. Agent list should show:
   - Publish stream (if any)
   - Status: active / revoked
4. UX safety:
   - Make it clear the agent key is separate from wallet key.
   - Provide copy/download option for the agent keypair.
5. Frontend is a dumb UI:
   - No direct backend or chain calls.
   - Uses SDK methods for all operations (create agent, grant/revoke publish, etc.).

## Tests
1. On-chain:
   - Authority can publish.
   - Delegated agent can publish.
   - Non-delegated agent cannot publish.
2. Backend:
   - Agent cannot claim multiple publish streams.
   - Only stream authority can grant/revoke.
3. SDK:
   - Builder outputs correct PDAs and accounts.

## Open Decisions
1. Which program owns `publisher_delegate`?  
   - Prefer `stream_registry` as canonical stream metadata.
2. Whether `/signals/prepare` requires agent signature.
   - Recommended: yes (prevents spam).

## Execution Order
1. On-chain updates + tests
2. Backend routes + checks
3. SDK methods
4. Frontend UI and wiring
