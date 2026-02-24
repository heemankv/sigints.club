#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PID=""
CHAIN_PID=""

log() {
  printf "[%s] %s\n" "$(date +"%H:%M:%S")" "$*"
}

log "Starting local chain..."
"$ROOT/scripts/run-chain.sh" --fresh --deploy &
CHAIN_PID=$!

cleanup() {
  log "Stopping stack..."
  if [ -n "$APP_PID" ]; then
    kill "$APP_PID" 2>/dev/null || true
  fi
  if [ -n "$CHAIN_PID" ]; then
    kill "$CHAIN_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

log "Waiting for localnet RPC..."
for _ in $(seq 1 40); do
  if solana -u http://127.0.0.1:8899 slot >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! solana -u http://127.0.0.1:8899 slot >/dev/null 2>&1; then
  echo "Localnet RPC did not come up."
  exit 1
fi

log "Waiting for program deployments..."
STREAM_KEYPAIR="$ROOT/target/deploy/stream_registry-keypair.json"
SUB_KEYPAIR="$ROOT/target/deploy/subscription_royalty-keypair.json"

for _ in $(seq 1 60); do
  if [ -f "$STREAM_KEYPAIR" ] && [ -f "$SUB_KEYPAIR" ]; then
    break
  fi
  sleep 1
done

if [ ! -f "$STREAM_KEYPAIR" ] || [ ! -f "$SUB_KEYPAIR" ]; then
  echo "Program keypairs not found. Did deploy fail?"
  exit 1
fi

STREAM_ID="$(solana-keygen pubkey "$STREAM_KEYPAIR")"
SUB_ID="$(solana-keygen pubkey "$SUB_KEYPAIR")"

for _ in $(seq 1 60); do
  STREAM_OK="$(solana -u http://127.0.0.1:8899 program show "$STREAM_ID" 2>/dev/null | grep -q "Program" && echo yes || echo no)"
  SUB_OK="$(solana -u http://127.0.0.1:8899 program show "$SUB_ID" 2>/dev/null | grep -q "Program" && echo yes || echo no)"
  if [ "$STREAM_OK" = "yes" ] && [ "$SUB_OK" = "yes" ]; then
    break
  fi
  sleep 2
done

if ! solana -u http://127.0.0.1:8899 program show "$STREAM_ID" >/dev/null 2>&1; then
  echo "stream_registry program not deployed."
  exit 1
fi
if ! solana -u http://127.0.0.1:8899 program show "$SUB_ID" >/dev/null 2>&1; then
  echo "subscription_royalty program not deployed."
  exit 1
fi

log "Starting backend (abler.sh)..."
export TAPESTRY_MOCK=true
if [ -x "$ROOT/scripts/abler.sh" ]; then
  "$ROOT/scripts/abler.sh" &
else
  "$ROOT/scripts/run-app.sh" &
fi
APP_PID=$!

log "Waiting for backend health..."
for _ in $(seq 1 40); do
  if node -e "fetch('http://localhost:3001/health').then(r=>{if(r.ok)process.exit(0);process.exit(1);}).catch(()=>process.exit(1));" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! node -e "fetch('http://localhost:3001/health').then(r=>{if(r.ok)process.exit(0);process.exit(1);}).catch(()=>process.exit(1));" >/dev/null 2>&1; then
  echo "Backend health check failed."
  exit 1
fi

if [ ! -d "$ROOT/sdk/node_modules" ] || [ ! -d "$ROOT/sdk/node_modules/tweetnacl" ]; then
  log "Installing SDK dependencies..."
  npm -C "$ROOT/sdk" install
fi

log "Running agent flow scenario..."
export NODE_PATH="$ROOT/sdk/node_modules"
"$ROOT/sdk/node_modules/.bin/tsx" "$ROOT/scripts/test-agent-flow.ts"

log "Test completed."
