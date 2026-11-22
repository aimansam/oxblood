# Operations runbook

## Before a drill
1. `python tools/range_dry_run.py --scenario <name>` prepares the range, validates every VM, then
   tears it down. Add `--keep` to leave it running. It creates real VMs.
2. With a range up, `python tools/isolation_check.py --pve-host <ip>` tests from inside the red VMs
   that the Proxmox web UI and SSH (and any `--block HOST:PORT` you add) are unreachable.

## Always on
- **Web UI:** the API serves the React build at `/app/`. The build is baked into the API image (no bind
  mount), so a git checkout cannot break it; rebuild with `docker compose -f deploy/docker-compose.yml build api`
  to ship UI changes. If the build is missing, `/app/` answers 503.
- **Metrics:** the stack ships no monitoring servers. The API exposes Prometheus-format counters at `/metrics`
  if you run your own scraper. It is open on the internal network; if the API port is reachable from outside,
  set `OXBLOOD_METRICS_TOKEN` and send it as a bearer token. `/healthz` and `/readyz` are the health probes.
- **In-memory state:** login and drill-start rate limits and setup-job progress (uploads, templates, snapshot builds)
  live in the API's memory. Restarting the API clears them, which is also the way to lift a login lockout.
  Run one worker; with several, each would keep its own counters and progress.
- **Backups:** `scripts/backup_db.sh` (see `deploy/backup/README.md`). Test a restore occasionally.

## Applying deploy changes
    docker compose -f deploy/docker-compose.yml up -d
