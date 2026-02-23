# Questions Resolution

Date: February 23, 2026

1. Q: Does the current non‑frontend code ensure that a user cannot subscribe to a private stream if they don't have their key setup?
Answer: Yes. On‑chain enforcement is active. The `subscription_royalty` program now requires the wallet‑key PDA when subscribing, and it checks that the key account exists and belongs to the subscriber if the stream visibility is private. If the key is missing or invalid, the transaction fails with `WalletKeyMissing`.

2. Q: Does the backend handle the key management? If the user updates the key to a new one, will the backend encrypt the next signal data with the new key?
Answer: Yes, if the user updates their key through the backend/SDK (`/wallet-key/sync`). That endpoint updates the subscriber directory entry, and the next signal uses the latest stored public key when building the keybox. If the user updates the on‑chain wallet key directly (without calling `/wallet-key/sync`), the backend will not see the change until sync is called.

3. Q: How does a user update their key right now? Is it a single function or multiple function calls in the SDK?
Answer: It is **two steps** today. Step 1 is an **on‑chain transaction** to register/update the wallet key (`register_wallet_key`) using the `buildRegisterWalletKeyInstruction` (UI does this via the Key Manager). Step 2 is a **backend sync** call so the backend updates the subscriber directory (`/wallet-key/sync`). In the SDK, there is a single helper for the backend step (`syncWalletKey` or `registerEncryptionKey`), but there is **no single SDK function that performs both steps** yet.

4. Q: Does the SDK currently expose two functions (one for on‑chain key registration and one for backend sync)?
Answer: No. The SDK **only exposes the backend sync** (`syncWalletKey` / `registerEncryptionKey`). The **on‑chain key registration helper lives in the frontend** (`buildRegisterWalletKeyInstruction` in `/frontend/app/lib/solana.ts`). If you want, we can move that into the SDK (e.g., `sdk/src/solana/walletKey.ts`) and re‑export it.
