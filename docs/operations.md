# Operations runbook

## What runs

| Container | What it is |
| --- | --- |
| `api` | One FastAPI service: the web UI at `/app/`, the REST API under `/api/`, and the runner that clones, seeds and tears down machines on Proxmox. |
| `postgres` | The only database: exercises, players, the score ledger and the audit log. |

The production compose file adds `traefik` in front for HTTPS. Nothing else ships: no cache, no object store and
no monitoring servers.

## Deploying

The everyday stack lives in `deploy/docker-compose.yml`. Settings come from `deploy/.env` (git-ignored).
`scripts/install.sh` creates it with generated secrets on the first run, starts the stack and waits until it is
ready; it never overwrites an existing `deploy/.env`. By hand:

    cp deploy/.env.example deploy/.env                 # first time only; set the secrets
    docker compose -f deploy/docker-compose.yml up -d --build --remove-orphans

The API image builds the web UI in a first stage, so a rebuild ships UI changes too. On start the API
applies any pending database migrations, then syncs the scenario catalog from `examples/scenarios`. Check it:

    curl -s localhost:5000/readyz          # {"status":"ok","checks":{"postgres":"ok"}}
    docker logs oxblood-api | tail

**Upgrading.** Back up first (`scripts/backup_db.sh`, see `deploy/backup/README.md`), then run the command above.
`--remove-orphans` removes containers that earlier versions started and the current compose file no longer
defines. It never removes volumes; old ones such as `oxblood-cyber-drill_redis-data` stay until you
`docker volume rm` them. To go back, restore the dump and run the previous commit.

**Demo.** `deploy/docker-compose.demo.yml` runs the whole app against an in-memory Proxmox, seeded with a live
team competition, on port 5050 (see the README). It needs no `.env` and keeps nothing between runs.

### Removing OxBlood

    scripts/cleanup.sh

No arguments, no questions. It removes this project's containers, network and data volumes for the everyday stack and
the demo, the built `oxblood/api` image, and `deploy/.env`. Since that deletes the database, it writes a backup first
to `~/oxblood-backups/oxblood-<date>.sql.gz` (set `OXBLOOD_BACKUP_DIR` to put it elsewhere). If the database is
stopped it starts it just long enough to dump it, and if the dump cannot be made or is empty it stops **before
deleting anything**. The image is kept if something else still uses it, and the production stack is never touched.
To restore a backup into a fresh install, see `deploy/backup/README.md`.

### Production (HTTPS)

`deploy/docker-compose.production.yaml` puts Traefik in front of the API with a Let's Encrypt certificate and does not
publish the API port. It runs a prebuilt image and reads its settings from an env file:

    cp deploy/.env.example deploy/.env.production      # edit: secrets and the public hostname
    docker build -f apps/api/Dockerfile -t oxblood/api:latest .
    docker compose -f deploy/docker-compose.production.yaml --env-file deploy/.env.production up -d

Required values: `POSTGRES_PASSWORD`, `OXBLOOD_TOKEN_SECRET` (random, 32+ characters), `PROXMOX_HOST`,
`PROXMOX_TOKEN_ID`, `PROXMOX_TOKEN_SECRET`, `OXBLOOD_BOOTSTRAP_ADMIN_SUB`, `OXBLOOD_BOOTSTRAP_ADMIN_PASSWORD`,
`ACME_EMAIL` and `PUBLIC_HOSTNAME`. Traefik needs host ports 80 and 443, so it cannot share a host with another
reverse proxy that already uses them; in that case run the everyday stack behind your proxy instead.

## Before a drill

1. `python tools/range_dry_run.py --scenario <name>` prepares the range, validates every VM, then
   tears it down. Add `--keep` to leave it running. It creates real VMs.
2. With a range up, `python tools/isolation_check.py --pve-host <ip>` tests from inside the red VMs
   that the Proxmox web UI and SSH (and any `--block HOST:PORT` you add) are unreachable.
3. `python tools/preflight.py` checks the API, the Proxmox connection and permissions, the template and the scenario.
4. `python tools/watch_drill.py` waits for a run to reach a status, and can cancel it after a delay.

## Always on

- **Health:** `/healthz` (liveness; answers GET and HEAD) and `/readyz` (Postgres reachable; GET). Both are also
  available under `/api/`.
- **Web UI:** the API serves the React build at `/app/`. The build is baked into the image (no bind mount), so a git
  checkout cannot break it. If the build is missing, `/app/` answers 503.
- **One worker.** Login and drill-start rate limits, and the progress of setup jobs (uploads, templates, snapshot
  builds), live in the API's memory. Restarting the API clears them, which is also the way to lift a login lockout.
  Do not run several workers: each would keep its own counters and progress.
- **Metrics:** the API exposes Prometheus-format counters at `/metrics` for any scraper you choose to run. It is open
  on the internal network; if the API port is reachable from outside, set `OXBLOOD_METRICS_TOKEN` and send it as a
  bearer token.
- **Backups:** `scripts/backup_db.sh` (see `deploy/backup/README.md`). Test a restore occasionally.
