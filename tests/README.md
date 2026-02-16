# Test Suites

This folder hosts cross-component integration and E2E tests.

## Install
```bash
cd /Users/heemankverma/Work/graveyard/tests
npm install
```

## Integration
```bash
npm run test:integration
```

## E2E (Localnet)
Pre-reqs:
1) Local validator running:
   `solana-test-validator --reset --ledger /tmp/solana-test-ledger`
2) `subscription_royalty` program deployed to localnet.

Run:
```bash
npm run test:e2e
```

Override defaults (optional):
- `E2E_RPC_URL` (default `http://127.0.0.1:8899`)
- `E2E_PROGRAM_ID` (default `BMDH241mpXx3WHuRjWp7DpBrjmKSBYhttBgnFZd5aHYE`)
