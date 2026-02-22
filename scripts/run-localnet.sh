#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

CHAIN_ARGS=()
APP_ARGS=()

for arg in "$@"; do
  case "$arg" in
    --fresh) CHAIN_ARGS+=("--fresh") ;;
    --deploy) CHAIN_ARGS+=("--deploy") ;;
    --demo) APP_ARGS+=("--demo") ;;
    *) ;;
  esac
done

log() {
  printf "[%s] %s\n" "$(date +"%H:%M:%S")" "$*"
}

log "Starting localnet + app stack..."
"$ROOT/scripts/run-chain.sh" "${CHAIN_ARGS[@]}" &
CHAIN_PID=$!

sleep 2
"$ROOT/scripts/run-app.sh" "${APP_ARGS[@]}" &
APP_PID=$!

cleanup() {
  log "Stopping stack..."
  kill "$APP_PID" "$CHAIN_PID" 2>/dev/null || true
}

trap cleanup EXIT
wait
