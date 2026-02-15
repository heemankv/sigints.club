# Local Solana Testing (Localnet)

## Why this exists
This document captures how to run a local Solana chain ("localnet") you can deploy programs to and test against, plus how to create accounts and fund them. It also notes a macOS-specific issue we hit and the workaround.

## Mental model (intuition)
Think of Solana localnet like a tiny, single-node cluster that runs on your machine.
- It has a real RPC endpoint.
- It has real accounts, balances, blockhashes, and sysvars.
- It is fully isolated from devnet and mainnet.

Alternative view:
- Localnet is like a local PostgreSQL database for your chain logic. You can create, reset, and destroy it quickly.
- In-process simulators (LiteSVM / Mollusk) are like unit tests that run without a network. Faster, but not a full RPC environment.

## Options and when to use them
1. solana-test-validator (localnet with RPC)
Use this when you want to deploy programs and use a normal client that talks to RPC.

2. LiteSVM or Mollusk (in-process simulation)
Use this when you want fast unit tests without RPC or network overhead.

3. Surfpool (local RPC but mirrors mainnet/devnet state)
Use this when you need realistic account state locally.

If you are not sure, start with solana-test-validator.

## Run localnet (solana-test-validator)
This starts a local validator and resets any previous ledger.

```bash
COPYFILE_DISABLE=1 solana-test-validator --reset --ledger /tmp/solana-test-ledger
```

Why `COPYFILE_DISABLE=1`?
On macOS, without it the validator can fail with:
`Archive error: extra entry found: "._genesis.bin"`
This is caused by AppleDouble metadata in the genesis archive. The env var prevents those files from being created.

## Stop localnet
If running in the foreground, press `Ctrl+C`.
If running in the background:

```bash
pkill -f solana-test-validator
```

## Create an account (keypair)
This creates a new localnet keypair in the project.

```bash
solana-keygen new -o /Users/heemankverma/Work/graveyard/.keys/localnet.json
```

## Point the CLI to localnet
```bash
solana config set --url http://127.0.0.1:8899
solana config set --keypair /Users/heemankverma/Work/graveyard/.keys/localnet.json
```

## Get SOL from the local faucet
```bash
solana airdrop 10
solana balance
```

## Deploy a program (example)
If you have a compiled `.so`:

```bash
solana program deploy /path/to/your_program.so
```

## Common pitfalls and fixes
1. "Connection refused" when calling RPC
Localnet is not running. Start the validator, then retry.

2. "Archive error: extra entry found: ._genesis.bin"
Use `COPYFILE_DISABLE=1` when starting the validator (macOS).

3. Wrong cluster URL in client code
Make sure your client points at `http://127.0.0.1:8899`.

## Exercises (to check understanding)
1. Start the validator, create a new keypair, and airdrop 2 SOL. What does `solana balance` show?
2. Change your CLI config to devnet and run `solana balance`. Why does it differ from localnet?
3. Describe one reason you would choose LiteSVM over solana-test-validator.

## Quick self-check questions
- What is the difference between localnet and devnet?
- Which command resets the local ledger?
- Why do we set `COPYFILE_DISABLE=1` on macOS?

