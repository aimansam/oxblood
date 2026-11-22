#!/usr/bin/env bash
# Remove an OxBlood stack. By default it only stops and removes the containers and network:
# your database, deploy/.env and the built images are kept, so scripts/install.sh brings it back as it was.
#
#   scripts/cleanup.sh                 everyday stack: containers and network only
#   scripts/cleanup.sh --demo          the demo stack instead
#   scripts/cleanup.sh --production    the production stack instead
#
#   --images     also remove the built oxblood/api image
#   --volumes    also DELETE THE DATABASE (the Docker volumes); asks you to confirm
#   --env        also delete deploy/.env, which holds your secrets; asks you to confirm
#   --all        --images --volumes --env
#   --yes        do not ask (required when there is no terminal)
#   --dry-run    show what would happen and change nothing
#
# Only this project's containers, volumes and image are touched; nothing else on the host.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$REPO/deploy"
ENV_FILE="${OXBLOOD_ENV_FILE:-$DEPLOY/.env}"

STACK=dev
IMAGES=0
VOLUMES=0
ENVF=0
YES=0
DRY=0

usage() { sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --demo) STACK=demo ;;
    --production) STACK=production ;;
    --images) IMAGES=1 ;;
    --volumes) VOLUMES=1 ;;
    --env) ENVF=1 ;;
    --all) IMAGES=1; VOLUMES=1; ENVF=1 ;;
    --yes | -y) YES=1 ;;
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

case "$STACK" in
  dev) FILE="$DEPLOY/docker-compose.yml"; PROJECT=oxblood-cyber-drill ;;
  demo) FILE="$DEPLOY/docker-compose.demo.yml"; PROJECT=oxblood-demo ;;
  production) FILE="$DEPLOY/docker-compose.production.yaml"; PROJECT=oxblood-cyber-drill-prod ;;
esac
COMPOSE=(docker compose -f "$FILE")
if [ "$STACK" = production ] && [ -f "$DEPLOY/.env.production" ]; then
  COMPOSE+=(--env-file "$DEPLOY/.env.production")
fi

if [ "$DRY" = 0 ]; then
  command -v docker >/dev/null 2>&1 || die "docker is required but was not found"
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required (the 'docker compose' command)"
fi

# A demo keeps nothing, and --env is about the everyday stack's file.
if [ "$STACK" = demo ] && [ "$ENVF" = 1 ]; then
  say "The demo has no env file; ignoring --env."
  ENVF=0
fi

confirm() {
  # confirm "<what will be lost>"
  if [ "$YES" = 1 ] || [ "$DRY" = 1 ]; then return 0; fi
  [ -t 0 ] || die "$1 would be deleted. Run again with --yes to confirm (there is no terminal to ask)."
  local answer
  printf '%s\nType "delete" to continue: ' "$1 will be deleted." >&2
  read -r answer
  [ "$answer" = delete ] || die "cancelled; nothing was deleted"
}

say "Stack: $STACK (project $PROJECT)"

if [ "$VOLUMES" = 1 ]; then
  if [ "$DRY" = 0 ]; then
    vols="$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT" | tr '\n' ' ')"
  else
    vols="(this project's volumes)"
  fi
  if [ -n "${vols// /}" ]; then
    say "This will delete the data volumes: $vols"
    confirm "The database and every other volume of this stack"
  else
    say "No data volumes exist for this stack."
  fi
fi

if [ "$ENVF" = 1 ] && [ -f "$ENV_FILE" ]; then
  confirm "$ENV_FILE (your generated secrets and the first admin password)"
fi

# 1. containers and network (and volumes, when asked)
down=("${COMPOSE[@]}" down --remove-orphans)
[ "$VOLUMES" = 1 ] && down+=(--volumes)
run "${down[@]}"

# 2. the built image, unless another container still uses it
if [ "$IMAGES" = 1 ]; then
  if [ "$DRY" = 1 ]; then
    run docker image rm oxblood/api:dev
  else
    docker image rm oxblood/api:dev >/dev/null 2>&1 && say "Removed the image oxblood/api:dev" ||
      say "Kept the image oxblood/api:dev (not found, or another stack still uses it)"
  fi
fi

# 3. the env file
if [ "$ENVF" = 1 ]; then
  if [ -f "$ENV_FILE" ]; then run rm -f "$ENV_FILE"; else say "No $ENV_FILE to delete."; fi
fi

say ""
if [ "$DRY" = 1 ]; then
  say "Dry run: nothing was changed."
else
  say "Done."
  [ "$VOLUMES" = 1 ] || say "Your data is kept. Bring the stack back with scripts/install.sh$([ "$STACK" = demo ] && echo ' --demo')."
fi
