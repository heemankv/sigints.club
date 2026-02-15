# Hybrid Encryption + Off-Chain Ciphertext (Persona.fun)
Date: 2026-02-14

## Purpose
Define the secure delivery mechanism for signals using hybrid encryption and off-chain ciphertext. This document answers edge cases and sets a reference for implementation.

## Core Idea (One Line)
Encrypt the signal once with a symmetric key, store the ciphertext off-chain, and encrypt that symmetric key separately for each subscriber.

## Why This Design
1. On-chain storage is too small and expensive for full ciphertext.
2. Per-subscriber full encryption is O(N) in size and cost.
3. Hybrid encryption keeps the signal encrypted once and only wraps a small key per subscriber.

## Key Types
1. Wallet signing key (Ed25519)
- Used for on-chain transactions.
- Not used for encryption.

2. Encryption key (X25519 or libsodium sealed box)
- Used to encrypt and decrypt the symmetric key.
- Each subscriber creates and stores this keypair.

## Data Objects
1. Signal ciphertext C
- The encrypted signal payload.
- Stored off-chain (backend storage in MVP).

2. Signal hash H
- SHA-256 hash of ciphertext C.
- Stored on-chain for integrity.

3. Pointer P
- The location of ciphertext C (URL or object id).
- Stored on-chain or inside a Tapestry content post.

4. Encrypted key bundle (Keybox)
- A map of `subscriber_id -> wrapped_key` entries (so each listener can grab only their entry).
- Stored off-chain due to size.
- Hash of the keybox is stored on-chain.

## Do Subscribers Need To Try All Keys?
No. Each subscriber should locate their key directly.

### Preferred approach (Keybox lookup)
- The keybox is a map keyed by subscriber identifier.
- The subscriber looks up their entry by their encryption public key or by a derived subscriber id.
- The subscriber only decrypts their own entry.

### Alternative approach (Index at subscription)
- When a subscriber joins, the system assigns them a fixed index.
- Each signal’s keybox uses the same index ordering.
- Subscriber decrypts only the entry at their index.

### Decision
Use a subscriber id derived from the encryption public key (hash of pubkey) so subscribers can find their entry without trial and error and the keybox can be public without leaking the wallet or raw pubkey.

## Step-by-Step Flow (MVP)
1. Subscriber generates encryption keypair and stores private key locally.
2. Subscriber registers encryption public key in the subscription record.
3. Provider generates a signal S.
4. Provider generates symmetric key K and encrypts S -> ciphertext C.
5. Provider uploads C to backend storage and gets pointer P.
6. Provider encrypts K for each subscriber:
   - EncKey_i = Encrypt(pubkey_i, K)
7. Provider builds a keybox map:
   - subscriber_id_i -> EncKey_i
8. Provider stores keybox off-chain and gets pointer PB.
9. Provider writes on-chain:
   - H = hash(C)
   - pointer P
   - hash(keybox)
   - pointer PB
   - metadata (timestamp, domain, tier)
10. Subscriber reads on-chain entry, fetches keybox PB, finds their entry, decrypts EncKey_i to get K, fetches C via P, verifies hash H, decrypts C -> signal.

## Sequence Diagram (Message Delivery)
```mermaid
sequenceDiagram
  actor Maker
  actor Taker
  participant Chain as Solana Program
  participant Store as Backend Store
  participant Box as Keybox Store

  Taker->>Chain: Subscribe with encryption public key
  Chain-->>Taker: Subscription record (subscriber_id = hash(pubkey))

  Maker->>Maker: Build signal S
  Maker->>Maker: Generate symmetric key K
  Maker->>Maker: Encrypt S with K -> C
  Maker->>Store: Upload C
  Store-->>Maker: Pointer P
  Maker->>Maker: Encrypt K for each subscriber -> EncKey_i
  Maker->>Box: Upload keybox (subscriber_id, EncKey_i)
  Box-->>Maker: Keybox pointer PB
  Maker->>Chain: Post signal metadata (hash(C), P, hash(keybox), PB)

  Taker->>Chain: Poll new signal metadata
  Chain-->>Taker: (hash(C), P, hash(keybox), PB)
  Taker->>Box: Fetch keybox PB
  Box-->>Taker: Keybox entries
  Taker->>Taker: Find own entry by subscriber_id
  Taker->>Taker: Decrypt EncKey_i -> K
  Taker->>Store: Fetch C via P
  Store-->>Taker: Ciphertext C
  Taker->>Taker: Verify hash(C) and decrypt C -> S
```

## Where The Pointer Comes From
The pointer is needed because ciphertext lives off-chain. The chain only stores hashes and references. Without a pointer, the subscriber has no way to locate the ciphertext.

## Privacy Considerations
1. If the keybox is public, anyone can see which subscriber ids are included.
2. To reduce leakage, use hashed subscriber ids, not raw pubkeys.
3. If a subscriber wants anonymity, they should use a dedicated encryption key per Persona.

## Scaling Options (Beyond MVP)
1. Tier Key Rotation
- Generate one symmetric key per tier (Trust/Verifier) per epoch.
- Subscribers decrypt only one key per epoch.
- Reduces per-signal overhead to O(1).

2. Tree-based group keying (MLS/TreeKEM)
- Efficient re-keying for large subscriber sets.
- More complex but scales to large audiences.

## Failure Modes And Mitigations
1. Wrong keybox entry
- Use hash checks and subscriber id validation.

2. Missing ciphertext
- On-chain hash will not verify.
- Fallback to re-upload or refund.

3. Key rotation out of sync
- Include epoch id in metadata.
- Allow a grace period with previous key.

## Hackathon Simplification (Safe Enough)
- Use backend storage for ciphertext and keybox.
- On-chain store hashes + pointers only.
- Subscriber identifies their key by hashing their encryption pubkey.
- Polling is acceptable for MVP.

## Recommended On-Chain Fields (Signal Record)
1. signal_hash (hash of ciphertext)
2. signal_pointer (URL or object id)
3. keybox_hash
4. keybox_pointer
5. tier_id
6. created_at
7. epoch_id (optional)

## Exercises (Check Understanding)
1. Why can’t a subscriber decrypt a hash?
2. What is the difference between ciphertext and keybox?
3. If the keybox is public, what metadata can it leak?
4. How does tier key rotation reduce on-chain load?
