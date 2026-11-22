#!/usr/bin/env bash
# Install OxBlood. Takes no arguments: run it and it does everything.
#
#   scripts/install.sh
#
# It creates deploy/.env with a generated database password, token secret and first admin (once; an existing
# deploy/.env is never touched), builds and starts the stack on http://localhost:5000/app/, waits until it is ready
# and prints the admin password. Running it again is safe. Proxmox credentials are entered in the web UI under
# Settings. Remove everything with scripts/cleanup.sh.
set -euo pipefail

if [ $# -ne 0 ]; then
  echo "scripts/install.sh takes no arguments; it does everything on its own." >&2
  exit 2
fi

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$REPO/deploy"
ENV_FILE="${OXBLOOD_ENV_FILE:-$DEPLOY/.env}"
COMPOSE_FILE="$DEPLOY/docker-compose.yml"
URL="http://localhost:5000"

say() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
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
  local i
  for i in $(seq 1 90); do
    if curl -fsS "$URL/readyz" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}

# ---- prerequisites
need docker
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required (the 'docker compose' command)"
need curl
command -v openssl >/dev/null 2>&1 || need python3
[ -f "$COMPOSE_FILE" ] || die "$COMPOSE_FILE is missing; run this from a full checkout of the repository"

# ---- deploy/.env, created once
GENERATED_ADMIN=""
if [ -f "$ENV_FILE" ]; then
  say "Keeping the existing $ENV_FILE"
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

# ---- build, start, wait
say "Starting OxBlood (builds the image on first run; this can take a few minutes)..."
docker compose -f "$COMPOSE_FILE" up -d --build --wait --wait-timeout 240 ||
  die "the stack did not start. If a port is already in use, free port 5000 and run this again; otherwise see: docker compose -f $COMPOSE_FILE logs"
wait_ready || die "OxBlood did not become ready; see: docker compose -f $COMPOSE_FILE logs api"

say ""
say "OxBlood is ready:  $URL/app/"
if [ -n "$GENERATED_ADMIN" ]; then
  say "  first admin   admin / $GENERATED_ADMIN   (shown once; it is also in $ENV_FILE)"
fi
say "Next: sign in, then add your Proxmox host and API token under Settings."
say "Remove everything later with: scripts/cleanup.sh"
