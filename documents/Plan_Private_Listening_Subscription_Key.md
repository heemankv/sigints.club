# Plan 3: Private Listening With Subscription-Scoped Keys (Agents Share Key)

## Goal
Private signals are encrypted, and each subscription (user + stream) has a single encryption keypair. All of a user’s agents can decrypt using that subscription key. Keybox size scales with number of subscribed users, not number of agents.

## Current Behavior (Baseline)
- One encryption key per wallet (`wallet_key` PDA).
- Keybox contains one entry per subscriber wallet.
- Agents are not part of keybox access control.

## Target Behavior
1. Each subscription has its own encryption keypair.
2. Backend wraps symmetric keys using the subscription public key.
3. Agents can fetch keybox entries without wallet signatures, if delegated.
4. User can rotate the subscription key at any time.

## Protocol (On-Chain) Changes
1. Add `subscription_key` account.
   - Recommended seeds: `["sub_key", stream_pda, subscriber_wallet]`
   - Fields: `subscriber`, `stream`, `enc_pubkey`, `updated_at`, `status`
2. Add instructions:
   - `register_subscription_key(stream, enc_pubkey)`
   - `update_subscription_key(stream, enc_pubkey)`
   - Signed by subscriber wallet (same wallet that owns the NFT).
3. Add `agent_access` account (if not already from Plan 2):
   - Seeds: `["agent_access", stream_pda, agent_pubkey]`
   - Fields: `stream`, `agent`, `owner_wallet`, `status`
   - Instructions: `grant_agent_access`, `revoke_agent_access`

## Backend Changes
1. Replace `resolveStreamSubscriberKeys`:
   - Fetch active subscriptions for stream.
   - For each subscription, fetch `subscription_key` PDA.
   - Build keybox entries from those public keys.
2. Update keybox access endpoint:
   - Accept `wallet + signature` OR `agent + signature`.
   - If agent, verify:
     - `agent_access` is active for stream.
     - Agent owner wallet holds active subscription NFT.
3. Add routes:
   - `POST /subscription-keys` (register/update)
   - `GET /subscription-keys/:streamId` (optional visibility for user)

## SDK Changes
1. Add instruction builders:
   - `buildRegisterSubscriptionKeyInstruction`
   - `buildUpdateSubscriptionKeyInstruction`
2. Add SDK helpers:
   - `registerSubscriptionKey(streamId, encPubKeyDerBase64)`
   - `updateSubscriptionKey(streamId, encPubKeyDerBase64)`
3. Add agent-authenticated keybox fetch:
   - `fetchKeyboxEntryAsAgent(...)`
4. Ensure SDK owns all network logic:
   - All backend requests and on-chain transactions for subscription keys and delegation must be exposed in SDK APIs.
   - Frontend must only call SDK methods (no direct backend/chain calls).
   - This ensures MCP servers can perform identical flows via SDK.

## Frontend Changes (UX/UI)
1. Subscription settings:
   - Show “Subscription Key” per stream.
   - Allow rotate key (regenerate + update on-chain).
2. Agent delegation panel:
   - Assign agent access per private stream.
   - Revoke access.
3. Agent list:
   - Show which private streams each agent can listen to.
4. Frontend is a dumb UI:
   - No direct backend or chain calls.
   - Uses SDK methods for all operations.

## Key Rotation Behavior
- After update, **new signals** use the new subscription key.
- Old signals remain decryptable only with the old key unless rewrapped.
- Optional migration: backend can rewrap old keybox entries (not required for MVP).

## Tests
1. On-chain:
   - Register + update subscription keys.
   - Unauthorized updates blocked.
2. Backend:
   - Keybox built from `subscription_key` PDAs.
   - Agent auth works only if delegated + owner has NFT.
3. SDK:
   - Key registration + key rotation flow.

## Execution Order
1. On-chain `subscription_key` + `agent_access`
2. Backend keybox and auth updates
3. SDK methods
4. Frontend UI
