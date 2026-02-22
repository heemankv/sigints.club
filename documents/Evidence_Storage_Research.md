# Evidence Storage Research (sigints.club)
Date: 2026-02-14

## Goal
Document storage options for evidence artifacts and select a practical MVP path.

## Decision Summary (MVP)
- Use backend storage for evidence artifacts.
- Store a SHA-256 hash and minimal metadata on-chain.
- Include a pointer (URL or object id) in Tapestry content.
- Revisit decentralized storage after MVP.

## Why Not On-Chain For MVP
On-chain storage is possible via Metaplex Inscriptions, which allow writing arbitrary data directly to Solana. However, it requires account storage rent and is not cost-effective for large or frequent evidence artifacts. Rent-exempt balances scale with account size. This makes on-chain storage expensive for large logs, screenshots, or videos.

## Options Evaluated
### Option 1: Backend Storage + On-Chain Hash (MVP)
- Summary: Store evidence in backend storage. Write hash and pointer on-chain.
- Strengths:
  - Fastest to ship.
  - Lowest cost and complexity.
  - Flexible for large artifacts.
- Weaknesses:
  - Requires trust in backend availability.
  - Not permanent or censorship-resistant.
- Best Use: MVP and early iterations.

### Option 2: Arweave via Irys
- Summary: Upload evidence to Arweave using Irys SDK. Store receipt id and hash on-chain.
- Strengths:
  - Permanent storage (pay once, store forever).
  - Receipts provide cryptographic timestamp proof.
  - Official SDKs for upload and retrieval.
- Weaknesses:
  - Additional upload step and cost.
  - Some operational complexity around funding and receipts.
- Best Use: Medium-term upgrade for high-integrity evidence.

### Option 3: Shadow Drive
- Summary: Use Shadow Drive decentralized storage with the Solana SDK.
- Strengths:
  - Solana-native storage network.
  - SDK supported for integration.
- Weaknesses:
  - Less commonly used than Arweave for immutable evidence.
- Best Use: If we want Solana-native storage but not full on-chain.

### Option 4: Metaplex Inscriptions (On-Chain)
- Summary: Store evidence directly on Solana using Metaplex Inscriptions.
- Strengths:
  - Fully on-chain data storage.
  - Data is immediately verifiable by the network.
- Weaknesses:
  - Requires rent-exempt storage based on account size.
  - Not cost-effective for large or frequent evidence.
- Best Use: Small evidence artifacts or critical metadata only.

## Recommended MVP Data Flow
1. Provider agent generates evidence artifacts.
2. Artifacts stored in backend storage.
3. SHA-256 hash computed for each artifact.
4. On-chain evidence PDA stores hash, timestamp, and pointer reference.
5. Tapestry content includes the pointer and on-chain hash reference.

## Future Decision Points
1. If evidence volume grows, move to Arweave via Irys for permanence.
2. If evidence needs to be fully on-chain, explore Metaplex Inscriptions for small artifacts.
3. If we want Solana-native storage without full on-chain cost, evaluate Shadow Drive.

## Sources
- Metaplex Inscriptions Overview (on-chain data storage): https://developers.metaplex.com/smart-contracts/inscription
- Solana rent exemption and account size costs: https://solana.com/developers/cookbook/accounts/calculate-rent
- Irys receipts and upload docs: https://docs.irys.xyz/build/d/features/receipts
- Irys upload SDK reference: https://docs.irys.xyz/build/d/sdk/upload/upload
- Shadow Drive SDK (GenesysGo): https://docs.rs/shadow-drive-sdk/latest/shadow_drive_sdk/
