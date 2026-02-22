# Tapestry Protocol Understanding (For sigints.club)
Date: 2026-02-14

## Purpose of This Doc
This document explains what Tapestry provides, how it works, and how to use it as the social layer for sigints.club. It is written as a practical, hackathon-focused skill note with examples and exercises.

## What Tapestry Is (In One Line)
Tapestry is a social graph protocol on Solana that lets you build profiles, follows, content, likes, and comments with a developer-friendly API, while keeping social data verifiable on-chain. citeturn6view6turn6view7

## Why It Matters For sigints.club
sigints.club needs a social layer that is:
1. Portable and composable across apps.
2. Cheap and fast for lots of social interactions.
3. Verifiable so reputation and interactions cannot be silently tampered with.

Tapestry is designed as a shared social layer with portable profiles and cross-app interoperation, which directly supports these goals. citeturn7view0turn8view0

## Architecture Intuition (How Tapestry Scales)
Tapestry stores social data (profiles, connections, interactions) in an off-chain graph database, organizes it into Merkle trees, and anchors the Merkle root on Solana. This keeps data verifiable on-chain while avoiding expensive storage for each interaction. citeturn6view7

Simple intuition:
- Think of the off-chain database as a fast “notebook.”
- The Merkle root on-chain is the “seal” that proves the notebook has not been changed. citeturn6view7

## Core Capabilities (What You Can Do)
1. Profiles: Create composable user identities tied to a wallet, scoped to a namespace. citeturn4view3turn2view0
2. Follows: Create follower-followee relationships with startId and endId. citeturn6view0turn6view1
3. Content: Create, update, and delete posts using the content endpoint. citeturn6view2turn5view3
4. Likes: Like and unlike content, and retrieve like data. citeturn6view3turn5view5
5. Comments: Create, update, delete, and retrieve comments on content. citeturn6view4turn5view6
6. Cross-app onboarding: Find all profiles for a wallet across the Tapestry ecosystem (including external namespaces). citeturn8view0

## Execution Methods (Speed vs Certainty)
Tapestry supports three execution methods, each with a different tradeoff between latency and confirmation certainty:
1. FAST_UNCONFIRMED: fastest, returns before on-chain confirmation.
2. QUICK_SIGNATURE: returns transaction signature, no confirmation.
3. CONFIRMED_AND_PARSED: slowest, waits for confirmed on-chain write. citeturn6view8turn4view3

Practical rule of thumb:
- Use FAST_UNCONFIRMED for low-risk social actions (likes, follows).
- Use CONFIRMED_AND_PARSED for high-stakes actions (identity creation, reputation-critical writes). This is a product choice, not a hard rule.

## Integration Options
Tapestry provides:
1. The SocialFi npm package for convenient integration.
2. A REST API if you want direct control. citeturn2view0turn6view2

Key setup steps:
1. Get an API key.
2. Set a namespace to separate your app’s profiles, follows, and content from other apps.
3. Initialize the client with the base URL and API key. citeturn2view0

## How sigints.club Uses Tapestry
This section maps sigints.club features to Tapestry capabilities.

1. Stream identities
- Each Stream is a Tapestry profile (namespaced for your app), tied to a wallet.
- Managers or a multisig controls the wallet used for profile creation. citeturn4view3

2. Subscription requests (only human posts)
- Subscription requests are Tapestry content posts.
- Use content customProperties to encode category, price, evidence requirements, and SLA.
- Example: { type: "request", domain: "pricing", asset: "ETH", maxLatencyMs: 3000 }
Tapestry supports content creation and custom properties in content payloads. citeturn6view2turn5view3

3. Provider discovery
- Discovery UI can list Tapestry profiles (Streams), using follow counts, likes, and comments as ranking signals.
- For onboarding, use the “find all profiles” flow to import existing social identity across apps. citeturn8view0turn6view1turn6view3turn6view4

4. Reputation and competition
- Likes and comments provide a lightweight on-chain reputation trail for Streams.
- Follower relationships show adoption and allow feed-style curation. citeturn6view1turn6view3turn6view4

5. Social graph + financial graph
- Tapestry handles identity and social signals.
- Solana programs handle staking, subscriptions, royalties, and slashing.
- This separation keeps the social layer light and fast while the financial layer stays formal and auditable.

## Concrete Hackathon Examples
Example 1: Stream profile creation
- Create a Tapestry profile with walletAddress, username, and namespace.
- Use FAST_UNCONFIRMED for faster UX during demos.
- The Stream profile is now discoverable and followable. citeturn4view3turn2view0

Example 2: Request post for ETH pricing
- A user creates a content post tagged as a “request.”
- Providers read the request and decide whether to mint a Stream to serve it.
- Others can like or comment to signal demand or specify evidence requirements. citeturn6view2turn6view3turn6view4

Example 3: Provider competition
- Agent A and Agent B both provide ETH price feeds.
- Users follow the agent they trust, like signals they confirm, and comment to challenge clarity.
- Discovery ranks providers by follower growth and verified engagement. citeturn6view1turn6view3turn6view4

Example 4: Cross-app onboarding
- When a user connects a wallet, use the profiles search with external profiles enabled to prefill their sigints.club identity.
- This reduces onboarding friction and imports existing identity context. citeturn8view0

## Limits And Design Choices (Important)
1. Tapestry is optimized for social data, not heavy evidence payloads.
- Large evidence artifacts should live in external storage (e.g., IPFS/Arweave), while Tapestry content stores a reference hash.
- This is a design choice inferred from Tapestry’s state-compressed social graph model. citeturn6view7

2. Execution method choice is product-sensitive.
- Use slower, confirmed writes for reputation-critical actions.
- Use fast writes for high-frequency social interactions. citeturn6view8

## Suggested Data Model For sigints.club On Tapestry
Use Tapestry content posts with customProperties. Example:
- contentType: "text"
- content: "Request: ETH best price every minute. Will pay 0.02 SOL per week."
- customProperties:
  - type: "request"
  - domain: "pricing"
  - asset: "ETH"
  - maxLatencyMs: 3000
  - evidenceLevel: "verifier"
  - budgetSOL: 0.02
Tapestry content supports custom properties for flexible metadata. citeturn5view3

## Quick Checklist (Hackathon Build)
1. Create Stream profiles in your namespace. citeturn4view3
2. Implement request posts via content creation. citeturn6view2
3. Use follows for subscription-like relationships. citeturn6view0
4. Use likes/comments for lightweight reputation. citeturn6view3turn6view4
5. Use find-all-profiles to speed onboarding. citeturn8view0

## Exercises (Check Understanding)
1. In your own words, why does Tapestry store social data off-chain with an on-chain Merkle root? citeturn6view7
2. Which execution method would you use for a Stream profile creation and why? citeturn6view8turn4view3
3. Design a “subscription request” post for an anime release tracker and list the customProperties you would include.
4. What would be a good ranking formula for provider discovery using follows, likes, and comment quality? citeturn6view1turn6view3turn6view4
5. If a user already has a profile in another Tapestry app, how would you import it? citeturn8view0

## If You Want Next
I can add a short integration plan that maps these APIs to concrete endpoints in your existing codebase, or draft a minimal UI for the discovery index.
