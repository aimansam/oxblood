# OxBlood Cyber Drill

A cyber range on your own Proxmox VE. OxBlood provisions scenario VMs, runs red-versus-blue exercises, accepts and scores flags, and writes the reports afterwards.

## How it fits together

```
Browser ──► Portal (Flask, :5000)
              ├── /app/   React UI (built from apps/web)
              └── /api/*  proxy ──► API (FastAPI, :8000, internal)
                                      ├── PostgreSQL   state and score ledger
                                      ├── Redis        progress, rate limits, event bus
                                      ├── MinIO        artifacts
                                      └── Proxmox VE   clones, boots and seeds the range
```

Prometheus, Alertmanager and Grafana ship in the same compose stack and listen on localhost only. The old `/`, `/login` and `/drill/` URLs redirect to `/app/`.

## Quickstart

```bash
git clone https://github.com/aimansam/oxblood.git
cd oxblood/deploy
cp .env.example .env     # set POSTGRES_PASSWORD, OXBLOOD_TOKEN_SECRET and the PROXMOX_* values
docker compose up -d
```

Open <http://localhost:5000/app/>. Create the first admin by setting `OXBLOOD_BOOTSTRAP_ADMIN_SUB` and `OXBLOOD_BOOTSTRAP_ADMIN_PASSWORD` in `.env` before the first start, then remove them. The bootstrap only creates an admin that does not exist yet; it never changes an existing password.

Proxmox credentials can also be entered in the web UI under Settings. A Proxmox user id is `<name>@<realm>` and the token id is `<user>!<token-name>`, for example `oxblood@pam!drill-token`.

## What you can do

- **Scenarios.** Each is a YAML file validated against [schemas/scenario.schema.json](schemas/scenario.schema.json). Two ship in [examples/scenarios](examples/scenarios): an enterprise file breach and a phishing-to-ransomware attack.
- **New exercise wizard.** Catalog, details, play format, setup checks, snapshots, then provisioning, with live progress.
- **Free play or team competition.** Teams, rounds with the sides swapped, a score ledger and a scoreboard. See [docs/competition.md](docs/competition.md).
- **Players.** Add them from a pasted list; each gets a generated password that must be replaced at first sign-in.
- **Live range map.** Machines, links and VLANs for operators; assigned machines only for players.
- **Fast ranges from snapshots.** Build clean Proxmox snapshots once and restore them for later exercises. See [docs/range-preparation.md](docs/range-preparation.md).
- **Reports** of what happened in each exercise.

## Development

```bash
OXBLOOD_DB_URL=sqlite+aiosqlite:///./test.sqlite pytest apps/api/tests tests   # API tests, about 4 minutes
ruff check . && ruff format --check .
python3 tools/validate_scenario.py examples/scenarios/
cd apps/web && npm ci && npm run lint && npm test && npm run build              # web
```

After an API change, regenerate the typed client with `python3 tools/export_openapi.py` and then `npm run gen:api`. Where things live is in [docs/monorepo-structure.md](docs/monorepo-structure.md).

## Documentation

| Document | What it covers |
| --- | --- |
| [Operations runbook](docs/operations.md) | Running and looking after the platform |
| [Range preparation](docs/range-preparation.md) | Lifecycle, capacity checks and snapshot baselines |
| [Running a team competition](docs/competition.md) | Teams, rounds, scoring and referees |
| [Template attack chain](docs/template-attack-chain.md) | The enterprise file breach attack path |
| [Monorepo structure](docs/monorepo-structure.md) | Where things live |

## License

MIT, see [LICENSE](LICENSE).

For authorized cybersecurity training and educational use only.
