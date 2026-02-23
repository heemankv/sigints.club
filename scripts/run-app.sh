#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT/.logs"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
SEED_LOG="$LOG_DIR/seed.log"

DEMO=false

for arg in "$@"; do
  case "$arg" in
    --demo) DEMO=true ;;
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

require_cmd node
require_cmd npm
require_cmd solana
require_cmd solana-keygen
require_cmd docker

if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE=(docker-compose)
else
  echo "Missing docker compose. Install Docker Desktop or docker-compose."
  exit 1
fi

mkdir -p "$LOG_DIR"

if command -v lsof >/dev/null 2>&1; then
  EXISTING_WEB="$(lsof -tiTCP:3000 -sTCP:LISTEN || true)"
  if [ -n "$EXISTING_WEB" ]; then
    log "Stopping existing frontend on :3000 ($EXISTING_WEB)"
    kill $EXISTING_WEB 2>/dev/null || true
    sleep 1
  fi
  EXISTING_BACKEND="$(lsof -tiTCP:3001 -sTCP:LISTEN || true)"
  if [ -n "$EXISTING_BACKEND" ]; then
    log "Stopping existing backend on :3001 ($EXISTING_BACKEND)"
    kill $EXISTING_BACKEND 2>/dev/null || true
    sleep 1
  fi
fi

log "Checking localnet RPC..."
if ! solana -u http://127.0.0.1:8899 slot >/dev/null 2>&1; then
  echo "Localnet RPC not reachable. Start it first with scripts/run-chain.sh"
  exit 1
fi

log "Ensuring Postgres is running..."
if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not running. Start Docker Desktop first."
  exit 1
fi

POSTGRES_CID="$("${DOCKER_COMPOSE[@]}" -f "$ROOT/docker-compose.yml" ps -q postgres 2>/dev/null || true)"
if [ -z "$POSTGRES_CID" ]; then
  log "Starting Postgres via docker compose..."
  "${DOCKER_COMPOSE[@]}" -f "$ROOT/docker-compose.yml" up -d postgres
  POSTGRES_CID="$("${DOCKER_COMPOSE[@]}" -f "$ROOT/docker-compose.yml" ps -q postgres 2>/dev/null || true)"
fi

for _ in $(seq 1 30); do
  if [ -n "$POSTGRES_CID" ] && docker exec "$POSTGRES_CID" pg_isready -U sigints -d sigints >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! ( [ -n "$POSTGRES_CID" ] && docker exec "$POSTGRES_CID" pg_isready -U sigints -d sigints >/dev/null 2>&1 ); then
  echo "Postgres is not ready. Check docker logs for the postgres container."
  exit 1
fi

if [ ! -d "$ROOT/backend/node_modules" ]; then
  log "Installing backend dependencies..."
  npm -C "$ROOT/backend" install
elif [ ! -d "$ROOT/backend/node_modules/express-async-errors" ]; then
  log "Updating backend dependencies..."
  npm -C "$ROOT/backend" install
fi

if [ ! -d "$ROOT/frontend/node_modules" ]; then
  log "Installing frontend dependencies..."
  npm -C "$ROOT/frontend" install
fi

KEYPAIR="$ROOT/.keys/localnet.json"
if [ ! -f "$KEYPAIR" ]; then
  echo "Missing localnet keypair at $KEYPAIR. Run scripts/run-chain.sh --fresh first."
  exit 1
fi

if [ ! -f "$ROOT/target/deploy/stream_registry-keypair.json" ]; then
  echo "Missing stream_registry keypair. Deploy programs with scripts/run-chain.sh --deploy"
  exit 1
fi

STREAM_REGISTRY_ID="$(solana-keygen pubkey "$ROOT/target/deploy/stream_registry-keypair.json")"
SUBSCRIPTION_ID="$(solana-keygen pubkey "$ROOT/target/deploy/subscription_royalty-keypair.json")"
CHALLENGE_ID="$(solana-keygen pubkey "$ROOT/target/deploy/challenge_slashing-keypair.json")"
PAYER_PUBKEY="$(solana-keygen pubkey "$KEYPAIR")"
TEST_WALLET_PUBKEY="$(solana-keygen pubkey "$ROOT/accounts/taker.json")"

STREAM_MAP="$(NODE_PATH="$ROOT/backend/node_modules" STREAM_REGISTRY_ID="$STREAM_REGISTRY_ID" node <<'NODE'
const { PublicKey } = require("@solana/web3.js");
const crypto = require("crypto");
const programId = new PublicKey(process.env.STREAM_REGISTRY_ID);
const streams = ["stream-eth", "stream-amazon", "stream-anime"];
const map = {};
for (const id of streams) {
  const hash = crypto.createHash("sha256").update(id).digest();
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("stream"), hash], programId);
  map[id] = pda.toBase58();
}
console.log(JSON.stringify(map));
NODE
)"

TAPESTRY_LINES=""
if [ -f "$ROOT/.env" ]; then
  TAPESTRY_LINES="$(grep '^TAPESTRY_' "$ROOT/.env" || true)"
fi

if [ -f "$ROOT/.env" ]; then
  BACKUP="$ROOT/.env.backup.$(date +%s)"
  cp "$ROOT/.env" "$BACKUP"
  log "Backed up existing .env to $BACKUP"
fi

cat > "$ROOT/.env.localnet" <<EOF
SOLANA_RPC_URL=http://127.0.0.1:8899
SOLANA_KEYPAIR=$KEYPAIR
SOLANA_PRIVATE_KEY=
SOLANA_ADDRESS=$PAYER_PUBKEY
SOLANA_SUBSCRIPTION_PROGRAM_ID=$SUBSCRIPTION_ID
SOLANA_STREAM_REGISTRY_PROGRAM_ID=$STREAM_REGISTRY_ID
SOLANA_CHALLENGE_PROGRAM_ID=$CHALLENGE_ID
SOLANA_STREAM_MAP=$STREAM_MAP
NEXT_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:8899
NEXT_PUBLIC_SUBSCRIPTION_PROGRAM_ID=$SUBSCRIPTION_ID
NEXT_PUBLIC_STREAM_REGISTRY_PROGRAM_ID=$STREAM_REGISTRY_ID
NEXT_PUBLIC_TREASURY_ADDRESS=$PAYER_PUBKEY
NEXT_PUBLIC_SOLANA_CLUSTER=devnet
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
DATABASE_URL=postgresql://sigints:sigints@localhost:5432/sigints
TEST_WALLET=true
TEST_WALLET_PATH=$ROOT/accounts/taker.json
NEXT_PUBLIC_TEST_WALLET=true
NEXT_PUBLIC_TEST_WALLET_PUBKEY=$TEST_WALLET_PUBKEY
${TAPESTRY_LINES}
EOF

cp "$ROOT/.env.localnet" "$ROOT/.env"
log "Wrote localnet env to .env and .env.localnet"

grep '^NEXT_PUBLIC_' "$ROOT/.env.localnet" > "$ROOT/frontend/.env.local"
log "Wrote frontend/.env.local"

log "Starting backend..."
(cd "$ROOT/backend" && npm run dev) > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

log "Waiting for backend health..."
for _ in $(seq 1 30); do
  if node -e "fetch('http://localhost:3001/health').then(r=>{if(r.ok)process.exit(0);process.exit(1);}).catch(()=>process.exit(1));" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! node -e "fetch('http://localhost:3001/health').then(r=>{if(r.ok)process.exit(0);process.exit(1);}).catch(()=>process.exit(1));" >/dev/null 2>&1; then
  echo "Backend health check failed. See $BACKEND_LOG"
  exit 1
fi

if $DEMO; then
  log "Seeding demo data (on-chain + social + backend)..."
  (cd "$ROOT/backend" && SEED_DEMO_ONCHAIN=1 SEED_DEMO_SOCIAL=1 SEED_DEMO_FORCE=1 npm run seed:demo) > "$SEED_LOG" 2>&1 || true
fi

log "Starting frontend..."
(cd "$ROOT/frontend" && npm run dev) > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

log "Waiting for frontend..."
for _ in $(seq 1 30); do
  if node -e "fetch('http://localhost:3000').then(r=>{if(r.status<500)process.exit(0);process.exit(1);}).catch(()=>process.exit(1));" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! node -e "fetch('http://localhost:3000').then(r=>{if(r.status<500)process.exit(0);process.exit(1);}).catch(()=>process.exit(1));" >/dev/null 2>&1; then
  echo "Frontend health check failed. See $FRONTEND_LOG"
  exit 1
fi

log "All services healthy."
log "Backend log:   $BACKEND_LOG"
log "Seed log:      $SEED_LOG"
log "Frontend log:  $FRONTEND_LOG"

cleanup() {
  log "Stopping app services..."
  kill "$FRONTEND_PID" "$BACKEND_PID" 2>/dev/null || true
}

trap cleanup EXIT
wait
