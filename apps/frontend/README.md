# DomainPeek Frontend

Next.js 15 App Router UI for DomainPeek — domain search, WHOIS/RDAP/DNS panels, security scoring, and theme-aware D3 visualizations.

**Live demo:** [https://domainpeek.xyz](https://domainpeek.xyz)

## Getting Started

From the monorepo root:

```bash
npm install
npm run dev:frontend
```

Open [http://localhost:4000](http://localhost:4000).

Set `NEXT_PUBLIC_API_BASE_URL` (see `.env.example` / `.env.local`) to point at the backend (default `http://localhost:4001`).

## Useful routes

- `/` — main domain analysis UI
- `/test-charts` — chart/theme sandbox
- `/api/health` — frontend health proxy toward the backend

## Related docs

- Root [README.md](../../README.md) — full stack setup, API, Docker
- [DOCKER_DEPLOYMENT.md](../../DOCKER_DEPLOYMENT.md) — container deploy guide
