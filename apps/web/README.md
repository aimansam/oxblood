# OxBlood web (React)

The web UI, served by the API at `/app/`. The sign-in token is kept in `localStorage.oxblood_token`.

Stack: React 18, TypeScript, Vite, React Router, TanStack Query, Tailwind with shadcn-style
components, `openapi-fetch` for a typed API client.

    npm ci
    npm run dev          # http://localhost:5173/app/ ; proxies /api to http://localhost:5000
    npm test             # vitest
    npm run typecheck && npm run lint && npm run build

Dev against another backend: `VITE_API_PROXY=http://host:port npm run dev`.

## API types
`src/api/schema.d.ts` is generated from `openapi.json`, which is exported from the FastAPI app:

    python3 tools/export_openapi.py     # from the repo root; rewrites apps/web/openapi.json
    npm run gen:api                     # regenerates src/api/schema.d.ts

CI fails if either file is stale. An endpoint only has useful types once it declares a
`response_model` in the API; add one before using a new endpoint from the UI.

## Layout
- `src/api` client, error formatting, token storage, query hooks
- `src/components` app shell and shared pieces; `src/components/ui` base components
- `src/features/<page>` one folder per screen
- Design tokens are CSS variables in `src/index.css`, mapped in `tailwind.config.ts`.

The production build is baked into the API image (`apps/api/Dockerfile`), not committed.

## Browser tests
`e2e/` holds Playwright tests that drive the production build against a throwaway stack
(the real API on SQLite with the mock Proxmox adapter, which also serves the build). They need a Redis
and the Python dependencies of `apps/api`:

    docker run -d --rm --name oxb-redis -p 127.0.0.1:6399:6379 redis:7-alpine
    npm run test:e2e                      # builds, starts the API on :8100, runs the suite
    OXBLOOD_REDIS_URL=redis://127.0.0.1:6379/0 E2E_PYTHON=.venv/bin/python npm run test:e2e

An already running stack on those ports is reused locally; CI always starts a fresh one.
