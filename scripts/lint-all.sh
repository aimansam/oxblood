#!/usr/bin/env bash
# Run the checks CI runs (everything except the browser tests), from anywhere.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> ruff check";                 ruff check .
echo "==> ruff format check";          ruff format --check .
echo "==> mypy (api)";                 mypy apps/api/app
echo "==> scenario YAML";              python3 tools/validate_scenario.py examples/scenarios/
echo "==> OpenAPI snapshot";           python3 tools/export_openapi.py --check
echo "==> pytest (api + repo)";        OXBLOOD_DB_URL=sqlite+aiosqlite:///./test.sqlite pytest apps/api/tests tests
echo "==> web: types, lint, tests, build"
(cd apps/web && npm run typecheck && npm run lint && npm test && npm run build)
echo "All checks passed. Browser tests: cd apps/web && npx playwright test"
