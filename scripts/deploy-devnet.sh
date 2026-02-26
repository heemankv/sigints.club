#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

RPC_URL=""
KEYPAIR=""
SECRET=""
SYNC_KEYS=false
NO_BUILD=false
COPY_IDL=true
PROGRAMS_SECTION=""
TEMP_KEYPAIR=""
DEPLOYMENTS_FILE=""
RESUME=true
SKIP_IDS=()
NEW_IDS=false

usage() {
  cat <<'USAGE'
Deploy Anchor programs to a Solana cluster (intended for devnet).

Usage:
  scripts/deploy-devnet.sh --rpc <RPC_URL> --keypair <PATH>
  scripts/deploy-devnet.sh --rpc <RPC_URL> --secret <SECRET>

Options:
  --rpc <RPC_URL>        RPC URL for the cluster (required)
  --keypair <PATH>       Wallet keypair JSON file (required unless --secret)
  --secret <SECRET>      Private key (JSON array or base58). Use quotes.
  --sync-keys            Run `anchor keys sync` before deploy
  --no-build             Skip `anchor build`
  --no-idl               Skip copying IDL files to backend/idl
  --programs <SECTION>   Anchor.toml [programs.<SECTION>] to deploy (default: provider.cluster)
  --deployments <PATH>   Deployments log file (default: deployments.json)
  --no-resume            Do not skip already-verified deployments
  --new-ids              Generate new program IDs and sync into Anchor.toml/declare_id!
  -h, --help             Show this help
USAGE
}

log() {
  printf "[%s] %s\n" "$(date +"%H:%M:%S")" "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

detect_programs_section() {
  if [[ -n "$PROGRAMS_SECTION" ]]; then
    echo "$PROGRAMS_SECTION"
    return
  fi
  if [[ -f "$ROOT/Anchor.toml" ]]; then
    awk -F'=' '
      $0 ~ /^[[:space:]]*cluster[[:space:]]*=/{gsub(/[ "\t]/, "", $2); print $2; exit}
    ' "$ROOT/Anchor.toml"
  fi
}

list_programs() {
  local section="$1"
  awk -v section="$section" '
    $0 ~ "^\\[programs\\."section"\\]" {in_section=1; next}
    in_section && $0 ~ "^\\[" {in_section=0}
    in_section && $0 ~ "=" {
      gsub(/[ \t"]/, "", $0);
      split($0, a, "=");
      if (a[1] != "" && a[2] != "") print a[1] " " a[2];
    }
  ' "$ROOT/Anchor.toml"
}

load_verified_programs() {
  local deployments_file="$1"
  local rpc_url="$2"
  python3 - <<'PY' "$deployments_file" "$rpc_url"
import json, os, sys
path = sys.argv[1]
rpc = sys.argv[2]
if not os.path.exists(path):
    sys.exit(0)
try:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
except json.JSONDecodeError:
    sys.exit(0)
if isinstance(data, dict):
    entries = data.get("deployments", [])
elif isinstance(data, list):
    entries = data
else:
    entries = []
latest = {}
for entry in entries:
    if not isinstance(entry, dict):
        continue
    if entry.get("rpc_url") != rpc:
        continue
    program_id = entry.get("program_id")
    if not program_id:
        continue
    latest[program_id] = entry
for program_id, entry in latest.items():
    if entry.get("status") == "verified":
        print(program_id)
PY
}

append_deployment() {
  local program_name="$1"
  local program_id="$2"
  local status="$3"
  local program_show_json="${4:-}"
  printf "%s" "$program_show_json" | python3 - <<'PY' "$DEPLOYMENTS_FILE" "$RPC_URL" "$PROGRAMS_SECTION" "$program_name" "$program_id" "$status"
import json, os, sys
from datetime import datetime, timezone

path, rpc_url, cluster, program_name, program_id, status = sys.argv[1:7]
program_show_raw = sys.stdin.read().strip()
program_show = None
if program_show_raw:
    try:
        program_show = json.loads(program_show_raw)
    except json.JSONDecodeError:
        program_show = {"raw": program_show_raw}

entry = {
    "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "rpc_url": rpc_url,
    "cluster": cluster,
    "program_name": program_name,
    "program_id": program_id,
    "status": status,
    "program_show": program_show,
}

deployments = []
if os.path.exists(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            deployments = data.get("deployments", [])
        elif isinstance(data, list):
            deployments = data
    except json.JSONDecodeError:
        deployments = []

deployments.append(entry)
with open(path, "w", encoding="utf-8") as f:
    json.dump({"deployments": deployments}, f, indent=2)
PY
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --rpc)
      RPC_URL="${2:-}"
      shift 2
      ;;
    --keypair)
      KEYPAIR="${2:-}"
      shift 2
      ;;
    --secret)
      SECRET="${2:-}"
      shift 2
      ;;
    --sync-keys)
      SYNC_KEYS=true
      shift
      ;;
    --no-build)
      NO_BUILD=true
      shift
      ;;
    --no-idl)
      COPY_IDL=false
      shift
      ;;
    --programs)
      PROGRAMS_SECTION="${2:-}"
      shift 2
      ;;
    --deployments)
      DEPLOYMENTS_FILE="${2:-}"
      shift 2
      ;;
    --no-resume)
      RESUME=false
      shift
      ;;
    --new-ids)
      NEW_IDS=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$RPC_URL" ]]; then
  usage
  exit 1
fi

require_cmd solana
require_cmd solana-keygen
require_cmd anchor
require_cmd python3

cleanup() {
  if [[ -n "$TEMP_KEYPAIR" && -f "$TEMP_KEYPAIR" ]]; then
    rm -f "$TEMP_KEYPAIR"
  fi
}
trap cleanup EXIT

if [[ -n "$SECRET" && -n "$KEYPAIR" ]]; then
  echo "Provide either --keypair or --secret, not both."
  exit 1
fi

if [[ -n "$SECRET" ]]; then
  require_cmd python3
  umask 077
  TEMP_KEYPAIR="$(mktemp -t solana-keypair.XXXXXX)"
  if [[ "$SECRET" =~ ^\\[.*\\]$ ]]; then
    python3 - <<'PY' "$SECRET" "$TEMP_KEYPAIR"
import json, sys
secret = sys.argv[1]
out = sys.argv[2]
try:
    data = json.loads(secret)
except json.JSONDecodeError as e:
    raise SystemExit(f"Invalid JSON array for --secret: {e}")
if not isinstance(data, list) or not all(isinstance(x, int) for x in data):
    raise SystemExit("Secret JSON must be an array of integers.")
if not all(0 <= x <= 255 for x in data):
    raise SystemExit("Secret JSON integers must be in [0,255].")
if len(data) != 64:
    raise SystemExit(f"Secret JSON must be 64 bytes, got {len(data)}.")
with open(out, "w", encoding="utf-8") as f:
    json.dump(data, f)
PY
  else
    python3 - <<'PY' "$SECRET" "$TEMP_KEYPAIR"
import sys, json
alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
index = {c:i for i,c in enumerate(alphabet)}
def b58decode(s: str) -> bytes:
    num = 0
    for ch in s:
        if ch not in index:
            raise SystemExit(f"Invalid base58 character: {ch}")
        num = num * 58 + index[ch]
    # Convert number to bytes
    b = bytearray()
    while num > 0:
        num, rem = divmod(num, 256)
        b.append(rem)
    b = bytes(reversed(b))
    # Add leading zeros
    pad = 0
    for ch in s:
        if ch == "1":
            pad += 1
        else:
            break
    return b"\x00" * pad + b

secret = sys.argv[1].strip()
out = sys.argv[2]
raw = b58decode(secret)
if len(raw) != 64:
    raise SystemExit(f"Base58 secret must decode to 64 bytes, got {len(raw)}.")
with open(out, "w", encoding="utf-8") as f:
    json.dump(list(raw), f)
PY
  fi
  KEYPAIR="$TEMP_KEYPAIR"
  log "Using keypair from --secret (temporary file)."
fi

if [[ -z "$KEYPAIR" ]]; then
  usage
  exit 1
fi

if [[ ! -f "$KEYPAIR" ]]; then
  echo "Keypair file not found: $KEYPAIR"
  exit 1
fi

if [[ -z "$DEPLOYMENTS_FILE" ]]; then
  DEPLOYMENTS_FILE="$ROOT/deployments.json"
fi
mkdir -p "$(dirname "$DEPLOYMENTS_FILE")"

PROGRAMS_SECTION="$(detect_programs_section || true)"
if [[ -z "$PROGRAMS_SECTION" ]]; then
  echo "Unable to detect programs section from Anchor.toml. Use --programs <SECTION>."
  exit 1
fi

if [[ ! -f "$ROOT/Anchor.toml" ]]; then
  echo "Anchor.toml not found at $ROOT/Anchor.toml"
  exit 1
fi

PROGRAMS=()
while IFS= read -r line; do
  [[ -n "$line" ]] && PROGRAMS+=("$line")
done <<EOF
$(list_programs "$PROGRAMS_SECTION")
EOF
if [[ ${#PROGRAMS[@]} -eq 0 ]]; then
  echo "No programs found under [programs.$PROGRAMS_SECTION] in Anchor.toml"
  exit 1
fi

if $NEW_IDS && $NO_BUILD; then
  echo "--new-ids requires a rebuild. Remove --no-build."
  exit 1
fi

PAYER_PUBKEY="$(solana-keygen pubkey "$KEYPAIR")"
log "RPC: $RPC_URL"
log "Wallet: $KEYPAIR ($PAYER_PUBKEY)"
log "Deployments file: $DEPLOYMENTS_FILE"

if $RESUME && [[ -f "$DEPLOYMENTS_FILE" ]]; then
  while IFS= read -r line; do
    [[ -n "$line" ]] && SKIP_IDS+=("$line")
  done <<EOF
$(load_verified_programs "$DEPLOYMENTS_FILE" "$RPC_URL")
EOF
  if [[ ${#SKIP_IDS[@]:-0} -gt 0 ]]; then
    log "Resume enabled: will skip ${#SKIP_IDS[@]} already-verified deployments."
  fi
fi

is_skipped() {
  local prog_id="$1"
  local ids=("${SKIP_IDS[@]:-}")
  for id in "${ids[@]}"; do
    [[ -z "$id" ]] && continue
    if [[ "$id" == "$prog_id" ]]; then
      return 0
    fi
  done
  return 1
}

if BALANCE="$(solana balance "$PAYER_PUBKEY" --url "$RPC_URL" 2>/dev/null)"; then
  log "Balance: $BALANCE"
else
  log "Balance: (unable to fetch)"
fi

if ! $NO_BUILD; then
  log "Building programs..."
  (cd "$ROOT" && anchor build)
fi

if $NEW_IDS; then
  log "Generating new program keypairs in target/deploy..."
  mkdir -p "$ROOT/target/deploy"
  for entry in "${PROGRAMS[@]}"; do
    name="${entry%% *}"
    keypair_path="$ROOT/target/deploy/${name}-keypair.json"
    solana-keygen new -s -f -o "$keypair_path" >/dev/null
  done
  SYNC_KEYS=true
fi

if $SYNC_KEYS; then
  log "Syncing Anchor program IDs with keypairs..."
  (cd "$ROOT" && anchor keys sync)
  log "Rebuilding after key sync..."
  (cd "$ROOT" && anchor build)

  PROGRAMS=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && PROGRAMS+=("$line")
  done <<EOF
$(list_programs "$PROGRAMS_SECTION")
EOF
  if [[ ${#PROGRAMS[@]} -eq 0 ]]; then
    echo "No programs found under [programs.$PROGRAMS_SECTION] in Anchor.toml after sync"
    exit 1
  fi
fi

log "Programs to deploy (programs.$PROGRAMS_SECTION):"
for entry in "${PROGRAMS[@]}"; do
  name="${entry%% *}"
  prog_id="${entry##* }"
  printf "  - %s: %s\n" "$name" "$prog_id"
done

log "Deploying programs..."
for entry in "${PROGRAMS[@]}"; do
  name="${entry%% *}"
  prog_id="${entry##* }"

  if is_skipped "$prog_id"; then
    log "Skipping $name ($prog_id) - already verified in deployments file."
    continue
  fi

  log "Deploying $name..."
  set +e
  (
    cd "$ROOT"
    ANCHOR_PROVIDER_URL="$RPC_URL" ANCHOR_WALLET="$KEYPAIR" \
      anchor deploy --provider.cluster "$RPC_URL" --provider.wallet "$KEYPAIR" --program-name "$name"
  )
  deploy_rc=$?
  set -e
  if [[ $deploy_rc -ne 0 ]]; then
    append_deployment "$name" "$prog_id" "deploy_failed" ""
    echo "Deployment failed for $name ($prog_id)."
    exit $deploy_rc
  fi

  log "Verifying $name ($prog_id)..."
  set +e
  program_show_json="$(solana program show "$prog_id" --url "$RPC_URL" --output json 2>/dev/null)"
  show_rc=$?
  set -e
  if [[ $show_rc -ne 0 ]]; then
    append_deployment "$name" "$prog_id" "verify_failed" ""
    echo "Verification failed for $name ($prog_id). Program not found or RPC error."
    exit 1
  fi
  append_deployment "$name" "$prog_id" "verified" "$program_show_json"
  log "Verified: $name ($prog_id)"
done

if $COPY_IDL; then
  log "Syncing IDL artifacts to backend/idl..."
  mkdir -p "$ROOT/backend/idl"
  cp -f "$ROOT"/target/idl/*.json "$ROOT/backend/idl/" 2>/dev/null || true
fi

log "Deploy complete."
