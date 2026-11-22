#!/usr/bin/env bash
# Install OxBlood: create deploy/.env with generated secrets, build and start the stack, wait until it is ready.
#
#   scripts/install.sh              everyday stack (api + postgres) on http://localhost:5000/app/
#   scripts/install.sh --demo       demo stack on http://localhost:5050/app/ (no Proxmox needed, nothing is kept)
#   scripts/install.sh --no-start   only create deploy/.env
#   scripts/install.sh --dry-run    show what would happen and change nothing
#
# Safe to run again: an existing deploy/.env is never touched. Proxmox credentials are not asked for here;
# enter them in the web UI under Settings, or edit deploy/.env. Remove everything with scripts/cleanup.sh.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$REPO/deploy"
ENV_FILE="${OXBLOOD_ENV_FILE:-$DEPLOY/.env}"

DEMO=0
START=1
DRY=0

usage() { sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --demo) DEMO=1 ;;
    --no-start) START=0 ;;
    --dry-run) DRY=1 ;;
    -h | --help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

say() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
run() {
  if [ "$DRY" = 1 ]; then printf '+ %s\n' "$*"; else "$@"; fi
}

need() { command -v "$1" >/dev/null 2>&1 || die "$1 is required but was not found"; }

rand_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    python3 -c 'import secrets, sys; print(secrets.token_hex(int(sys.argv[1])))' "$1"
  fi
}

# set_var KEY VALUE: replace the first "KEY=..." or "# KEY=..." line in the env file, or append it.
set_var() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  if grep -qE "^#? ?${key}=" "$ENV_FILE"; then
    K="$key" V="$value" awk '
      !done && $0 ~ "^#? ?" ENVIRON["K"] "=" { print ENVIRON["K"] "=" ENVIRON["V"]; done = 1; next }
      { print }' "$ENV_FILE" >"$tmp"
  else
    cat "$ENV_FILE" >"$tmp"
    printf '%s=%s\n' "$key" "$value" >>"$tmp"
  fi
  cat "$tmp" >"$ENV_FILE"
  rm -f "$tmp"
}

wait_ready() {
  local url="$1" i
  for i in $(seq 1 90); do
    if curl -fsS "$url" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}

# ---- prerequisites: docker is only needed when something will actually be started
if [ "$START" = 1 ] && [ "$DRY" = 0 ]; then
  need docker
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required (the 'docker compose' command)"
  need curl
fi
if ! command -v openssl >/dev/null 2>&1; then need python3; fi

# ---- demo: self-contained, no secrets to generate
if [ "$DEMO" = 1 ]; then
  FILE="$DEPLOY/docker-compose.demo.yml"
  say "Starting the demo stack (builds the image on first run; this can take a few minutes)..."
  run docker compose -f "$FILE" up -d --build
  if [ "$DRY" = 1 ]; then exit 0; fi
  wait_ready "http://localhost:5050/readyz" || die "the demo did not become ready; see: docker compose -f $FILE logs api"
  seed="$(docker compose -f "$FILE" ps -aq seed)"
  if [ -n "$seed" ]; then
    code="$(docker wait "$seed")"
    [ "$code" = 0 ] || die "seeding the demo failed; see: docker logs $seed"
  fi
  say ""
  say "OxBlood demo is ready:  http://localhost:5050/app/"
  say "  operator   admin / OxbloodDemo-2026"
  say "  players    aisyah (red) and hafiz (blue), password Player-Demo-2026"
  say "Remove it with: scripts/cleanup.sh --demo"
  exit 0
fi

# ---- everyday stack: create deploy/.env once
GENERATED_ADMIN=""
if [ -f "$ENV_FILE" ]; then
  say "Keeping the existing $ENV_FILE"
elif [ "$DRY" = 1 ]; then
  say "+ create $ENV_FILE from deploy/.env.example with a generated database password, token secret and admin account"
else
  [ -f "$DEPLOY/.env.example" ] || die "$DEPLOY/.env.example is missing"
  mkdir -p "$(dirname "$ENV_FILE")"
  (umask 077 && cp "$DEPLOY/.env.example" "$ENV_FILE")
  GENERATED_ADMIN="$(rand_hex 12)"
  set_var POSTGRES_PASSWORD "$(rand_hex 16)"
  set_var OXBLOOD_TOKEN_SECRET "$(rand_hex 32)"
  set_var OXBLOOD_BOOTSTRAP_ADMIN_SUB admin
  set_var OXBLOOD_BOOTSTRAP_ADMIN_PASSWORD "$GENERATED_ADMIN"
  chmod 600 "$ENV_FILE"
  say "Created $ENV_FILE (readable only by you) with generated secrets"
fi

if [ "$START" = 0 ]; then
  say "Skipping the start (--no-start)."
  if [ -n "$GENERATED_ADMIN" ]; then
    say "First admin, created when the API first starts:  admin / $GENERATED_ADMIN"
  fi
  exit 0
fi

FILE="$DEPLOY/docker-compose.yml"
say "Starting OxBlood (builds the image on first run; this can take a few minutes)..."
run docker compose -f "$FILE" up -d --build --wait --wait-timeout 240
if [ "$DRY" = 1 ]; then exit 0; fi
wait_ready "http://localhost:5000/readyz" || die "OxBlood did not become ready; see: docker compose -f $FILE logs api"

say ""
say "OxBlood is ready:  http://localhost:5000/app/"
if [ -n "$GENERATED_ADMIN" ]; then
  say "  first admin   admin / $GENERATED_ADMIN   (shown once; it is also in $ENV_FILE)"
fi
say "Next: sign in, then add your Proxmox host and API token under Settings."
say "Remove everything later with: scripts/cleanup.sh"
