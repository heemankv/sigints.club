# Questions Resolution

Date: February 23, 2026

1. Q: Does the current non‑frontend code ensure that a user cannot subscribe to a private stream if they don't have their key setup?
Answer: Yes. On‑chain enforcement is active. The `subscription_royalty` program now requires the wallet‑key PDA when subscribing, and it checks that the key account exists and belongs to the subscriber if the stream visibility is private. If the key is missing or invalid, the transaction fails with `WalletKeyMissing`.

2. Q: Does the backend handle the key management? If the user updates the key to a new one, will the backend encrypt the next signal data with the new key?
Answer: Yes. The backend now resolves wallet keys directly from chain at publish time, so any on‑chain key update is picked up automatically on the next signal. The `/wallet-key/sync` endpoint is no longer required for key rotation (it is validation only).

3. Q: How does a user update their key right now? Is it a single function or multiple function calls in the SDK?
Answer: It is **one required step**: an **on‑chain transaction** to register/update the wallet key (`register_wallet_key`) using the `buildRegisterWalletKeyInstruction` (UI does this via the Key Manager). The backend `/wallet-key/sync` call is optional and only validates the on‑chain key.

4. Q: Does the SDK currently expose two functions (one for on‑chain key registration and one for backend sync)?
Answer: No. The SDK **only exposes the backend sync** (`syncWalletKey` / `registerEncryptionKey`), which is now validation‑only. The **on‑chain key registration helper lives in the frontend** (`buildRegisterWalletKeyInstruction` in `/frontend/app/lib/solana.ts`). If you want, we can move that into the SDK (e.g., `sdk/src/solana/walletKey.ts`) and re‑export it.
