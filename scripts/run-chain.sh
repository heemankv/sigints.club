#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LEDGER_DIR="$ROOT/.localnet-ledger"
LOG_DIR="$ROOT/.logs"
VALIDATOR_LOG="$LOG_DIR/validator.log"

FRESH=false
DEPLOY=false

for arg in "$@"; do
  case "$arg" in
    --fresh) FRESH=true ;;
    --deploy) DEPLOY=true ;;
    *) ;;
  esac
done

log() {
  printf "[%s] %s\n" "$(date +"%H:%M:%S")" "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

require_cmd solana-test-validator
require_cmd solana
require_cmd solana-keygen
require_cmd anchor

mkdir -p "$LOG_DIR"

if $FRESH; then
  if command -v lsof >/dev/null 2>&1; then
    EXISTING_PIDS="$(lsof -tiTCP:8899 -sTCP:LISTEN || true)"
    if [ -n "$EXISTING_PIDS" ]; then
      log "Stopping existing validator on :8899 ($EXISTING_PIDS)"
      kill $EXISTING_PIDS 2>/dev/null || true
      sleep 1
    fi
  fi
  if command -v pgrep >/dev/null 2>&1; then
    PIDS="$(pgrep -f solana-test-validator || true)"
    if [ -n "$PIDS" ]; then
      log "Stopping existing solana-test-validator processes ($PIDS)"
      kill $PIDS 2>/dev/null || true
      sleep 1
    fi
  fi
fi

if $FRESH; then
  log "Clearing localnet ledger at $LEDGER_DIR"
  rm -rf "$LEDGER_DIR"
fi

log "Starting solana-test-validator..."
COPYFILE_DISABLE=1 solana-test-validator --ledger "$LEDGER_DIR" ${FRESH:+--reset} > "$VALIDATOR_LOG" 2>&1 &
VALIDATOR_PID=$!

log "Waiting for localnet RPC..."
for _ in $(seq 1 30); do
  if solana -u http://127.0.0.1:8899 slot >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! solana -u http://127.0.0.1:8899 slot >/dev/null 2>&1; then
  echo "Localnet RPC did not come up. Check $VALIDATOR_LOG"
  exit 1
fi

KEYPAIR="$ROOT/.keys/localnet.json"
if [ ! -f "$KEYPAIR" ]; then
  log "Creating localnet keypair at $KEYPAIR"
  mkdir -p "$(dirname "$KEYPAIR")"
  solana-keygen new -s -o "$KEYPAIR" >/dev/null
fi

PAYER_PUBKEY="$(solana-keygen pubkey "$KEYPAIR")"
log "Airdropping SOL to $PAYER_PUBKEY"
solana -u http://127.0.0.1:8899 airdrop 10 "$PAYER_PUBKEY" >/dev/null 2>&1 || true

if $FRESH && [ -d "$ROOT/accounts" ]; then
  log "Funding wallets in $ROOT/accounts (fresh chain)"
  for keyfile in "$ROOT"/accounts/*.json; do
    [ -f "$keyfile" ] || continue
    pubkey="$(solana-keygen pubkey "$keyfile")"
    log "Airdropping 5 SOL to $pubkey"
    solana -u http://127.0.0.1:8899 airdrop 5 "$pubkey" >/dev/null 2>&1 || true
  done
fi

if $DEPLOY || $FRESH; then
  log "Deploying programs via Anchor..."
  (
    cd "$ROOT"
    log "Building programs first..."
    anchor build
    log "Syncing Anchor program IDs with local keypairs..."
    anchor keys sync
    log "Rebuilding after key sync..."
    anchor build
    ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET="$KEYPAIR" \
      anchor deploy --provider.cluster http://127.0.0.1:8899 --provider.wallet "$KEYPAIR"
    log "Syncing IDL artifacts to backend/idl..."
    mkdir -p "$ROOT/backend/idl"
    cp -f "$ROOT"/target/idl/*.json "$ROOT/backend/idl/" 2>/dev/null || true
  )
fi

log "Localnet ready. Validator log: $VALIDATOR_LOG"
log "Press Ctrl+C to stop the validator."

cleanup() {
  log "Stopping localnet validator..."
  kill "$VALIDATOR_PID" 2>/dev/null || true
}

trap cleanup EXIT
wait
