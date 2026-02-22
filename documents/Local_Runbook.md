# Local Runbook (sigints.club)
Date: 2026-02-22

This is the **single source** for running the full stack locally: Solana localnet, fresh deploy, backend, frontend, and demo data.

---

## 1) Localnet (Fresh Chain)
Use this if you want a **clean chain**.

```bash
# Clean + start localnet
rm -rf /Users/heemankverma/Work/graveyard/.localnet-ledger
COPYFILE_DISABLE=1 solana-test-validator --reset --ledger /Users/heemankverma/Work/graveyard/.localnet-ledger
```

### AppleDouble fix (if you see `._genesis.bin` error)
```bash
rm -rf /Users/heemankverma/Work/graveyard/.localnet-ledger
COPYFILE_DISABLE=1 solana-test-validator --reset --ledger /Users/heemankverma/Work/graveyard/.localnet-ledger
```

---

## 2) Localnet (Resume Existing Chain)
Only if you **did NOT** delete the ledger.

```bash
COPYFILE_DISABLE=1 solana-test-validator --ledger /Users/heemankverma/Work/graveyard/.localnet-ledger
```

---

## 3) Deploy Programs to Localnet (Fresh Deploy)
```bash
cd /Users/heemankverma/Work/graveyard

export ANCHOR_PROVIDER_URL=http://127.0.0.1:8899
export ANCHOR_WALLET=/Users/heemankverma/Work/graveyard/.keys/localnet.json

[ -f "$ANCHOR_WALLET" ] || solana-keygen new -s -o "$ANCHOR_WALLET"
solana airdrop 10 -u "$ANCHOR_PROVIDER_URL" "$(solana-keygen pubkey "$ANCHOR_WALLET")"

anchor build
anchor deploy
```

---

## 4) Backend (Dev Mode)
```bash
cd /Users/heemankverma/Work/graveyard/backend

export SOLANA_RPC_URL=http://127.0.0.1:8899
export SOLANA_SUBSCRIPTION_PROGRAM_ID=BMDH241mpXx3WHuRjWp7DpBrjmKSBYhttBgnFZd5aHYE
export SOLANA_STREAM_REGISTRY_PROGRAM_ID=5mDTkhRWcqVi4YNBqLudwMTC4imfHjuCtRu82mmDpSRi
export SOLANA_KEYPAIR=/Users/heemankverma/Work/graveyard/.keys/localnet.json
export SOLANA_IDL_PATH=/Users/heemankverma/Work/graveyard/backend/idl/subscription_royalty.json
export TAPESTRY_API_KEY=your_key_here

# Optional demo seed data (recommended for UI testing)
export SEED_DEMO_DATA=true
export SEED_DEMO_FORCE=true
export SEED_DEMO_ONCHAIN=true
export SEED_DEMO_SOCIAL=false

npm run dev
```

---

## 5) Frontend (Dev Mode)
```bash
cd /Users/heemankverma/Work/graveyard/frontend

export NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:3001
export NEXT_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:8899
export NEXT_PUBLIC_SUBSCRIPTION_PROGRAM_ID=BMDH241mpXx3WHuRjWp7DpBrjmKSBYhttBgnFZd5aHYE
export NEXT_PUBLIC_STREAM_REGISTRY_PROGRAM_ID=5mDTkhRWcqVi4YNBqLudwMTC4imfHjuCtRu82mmDpSRi

npm run dev
```

---

## 6) Create Test Wallets (Localnet)
```bash
solana-keygen new -s -o /tmp/maker.json
solana-keygen new -s -o /tmp/listener.json

solana airdrop 5 -u http://127.0.0.1:8899 $(solana-keygen pubkey /tmp/maker.json)
solana airdrop 5 -u http://127.0.0.1:8899 $(solana-keygen pubkey /tmp/listener.json)
```

**Import into Phantom**: paste the JSON secret array when adding/importing a wallet.

---

## 7) E2E Tests (Localnet)
```bash
cd /Users/heemankverma/Work/graveyard/tests
TAPESTRY_API_KEY=your_key_here npm run test:e2e
```

### Using the Tapestry mock client (tests only)
If you want to run tests without hitting Tapestry, you can force the in-memory mock client:
```bash
TAPESTRY_MOCK=true npm run test:e2e
```

---

## 8) Backend Tests
```bash
npm -C /Users/heemankverma/Work/graveyard/backend run test
```

---

## 9) Frontend Build (Type Check)
```bash
npm -C /Users/heemankverma/Work/graveyard/frontend run build
```

---

## 10) Quick Reset (Rebuild Everything)
If your chain state is corrupted or you want a clean demo run:
```bash
# Stop all running services first

rm -rf /Users/heemankverma/Work/graveyard/.localnet-ledger
COPYFILE_DISABLE=1 solana-test-validator --reset --ledger /Users/heemankverma/Work/graveyard/.localnet-ledger

# Then redeploy and restart backend/frontend
```
