#!/usr/bin/env bash
# Remove OxBlood from this machine. Takes no arguments and asks no questions: run it and it does everything.
#
#   scripts/cleanup.sh
#
# It removes the everyday stack and the demo stack (containers, network, data volumes), the built image and
# deploy/.env. Because that deletes the database, it first writes a backup of it to ~/oxblood-backups
# (override with OXBLOOD_BACKUP_DIR) and stops without deleting anything if that backup cannot be made.
# Only this project's resources are touched. The production stack (docker-compose.production.yaml) is never
# touched; remove that one deliberately with docker compose.
# Set it up again with scripts/install.sh.
set -euo pipefail

if [ $# -ne 0 ]; then
  echo "scripts/cleanup.sh takes no arguments; it does everything on its own." >&2
  exit 2
fi

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$REPO/deploy"
ENV_FILE="${OXBLOOD_ENV_FILE:-$DEPLOY/.env}"
BACKUP_DIR="${OXBLOOD_BACKUP_DIR:-$HOME/oxblood-backups}"

DEV_FILE="$DEPLOY/docker-compose.yml"
DEV_PROJECT=oxblood-cyber-drill
DEMO_FILE="$DEPLOY/docker-compose.demo.yml"
DEMO_PROJECT=oxblood-demo
DB_CONTAINER=oxblood-postgres
IMAGE=oxblood/api:dev

say() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker is required but was not found"
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required (the 'docker compose' command)"

label="label=com.docker.compose.project"
containers_of() { docker ps -aq --filter "$label=$1"; }
volumes_of() { docker volume ls -q --filter "$label=$1"; }
exists() { [ -n "$(containers_of "$1")$(volumes_of "$1")" ]; }

have_dev=0; have_demo=0
exists "$DEV_PROJECT" && have_dev=1
exists "$DEMO_PROJECT" && have_demo=1

# ---- 1. back up the database, because removing the stack deletes it
BACKUP_FILE=""
if [ -n "$(volumes_of "$DEV_PROJECT")" ]; then
  running="$(docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null || echo false)"
  if [ "$running" != true ]; then
    say "Starting the database briefly so it can be backed up..."
    docker compose -f "$DEV_FILE" up -d --wait postgres >/dev/null ||
      die "could not start the database to back it up; nothing was deleted"
  fi
  mkdir -p "$BACKUP_DIR"
  BACKUP_FILE="$BACKUP_DIR/oxblood-$(date +%Y%m%d-%H%M%S).sql.gz"
  if ! (umask 077 && docker exec "$DB_CONTAINER" pg_dump -U oxblood oxblood | gzip >"$BACKUP_FILE"); then
    rm -f "$BACKUP_FILE"
    die "the database backup failed; nothing was deleted"
  fi
  if ! gzip -t "$BACKUP_FILE" 2>/dev/null || [ -z "$(gzip -dc "$BACKUP_FILE" | head -c 1)" ]; then
    rm -f "$BACKUP_FILE"
    die "the database backup is empty or damaged; nothing was deleted"
  fi
  say "Backed up the database to $BACKUP_FILE"
fi

# ---- 2. remove the stacks (containers, network, data volumes)
if [ "$have_dev" = 1 ]; then
  say "Removing the OxBlood stack..."
  docker compose -f "$DEV_FILE" down --remove-orphans --volumes
fi
if [ "$have_demo" = 1 ]; then
  say "Removing the OxBlood demo..."
  docker compose -f "$DEMO_FILE" down --remove-orphans --volumes
fi

# ---- 3. the built image (kept if something outside this project still uses it)
if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  if docker image rm "$IMAGE" >/dev/null 2>&1; then
    say "Removed the image $IMAGE"
  else
    say "Kept the image $IMAGE (still in use)"
  fi
fi

# ---- 4. the secrets file
if [ -f "$ENV_FILE" ]; then
  rm -f "$ENV_FILE"
  say "Removed $ENV_FILE"
fi

say ""
if [ "$have_dev" = 0 ] && [ "$have_demo" = 0 ] && [ -z "$BACKUP_FILE" ]; then
  say "Nothing was installed; nothing to remove."
else
  say "Done. OxBlood is removed."
  [ -z "$BACKUP_FILE" ] || say "Your database backup is $BACKUP_FILE (restore steps: deploy/backup/README.md)."
fi
say "Set it up again with: scripts/install.sh"
