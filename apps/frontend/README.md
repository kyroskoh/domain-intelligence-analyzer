# DomainPeek Frontend

Next.js 15 App Router UI for DomainPeek — domain search, WHOIS/RDAP/DNS panels, live DNS alerts, security scoring, and theme-aware D3 visualizations.

**Live demo:** [https://domainpeek.xyz](https://domainpeek.xyz)

## Getting Started

From the monorepo root:

```bash
npm install
npm run dev:frontend
```

Open [http://localhost:4000](http://localhost:4000).

```bash
cp .env.example .env
```

Both apps use **`.env`** (not `.env.local`). [`.env.example`](.env.example) prefers `NEXT_PUBLIC_API_*=https://domainpeek.xyz` (same as `./deploy.sh -p nginx`). For a local Express API, change both to `http://localhost:4001`. `INTERNAL_API_URL` defaults to `http://localhost:4001` for `/api/health`.

For Docker/VPS, `./deploy.sh` auto-fills root `NEXT_PUBLIC_API_*` and passes them as image build args — see [DOCKER_DEPLOYMENT.md](../../DOCKER_DEPLOYMENT.md).

Behind nginx, Socket.IO uses the same public origin (`/socket.io/` → backend). Registration dates render as **DD/MMM/YYYY** with **HH:MM:SS** when time is present (UTC by default; toggle to local timezone on the dashboard).

## Useful routes

- `/` — main domain analysis UI (includes live notification bell)
- `/test-charts` — chart/theme sandbox
- `/api/health` — frontend health proxy toward the backend (`INTERNAL_API_URL` in Docker)

## Related docs

- Root [README.md](../../README.md) — full stack setup, API, Docker
- [DOCKER_DEPLOYMENT.md](../../DOCKER_DEPLOYMENT.md) — container deploy guide
