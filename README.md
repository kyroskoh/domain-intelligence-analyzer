# DomainPeek

A production-grade web application that provides comprehensive domain analysis including WHOIS/RDAP registration data, DNS records analysis, TLS certificate probing, ASN/BGP intelligence, entity deep links, security scoring, and interactive visualizations. Built with modern web technologies and designed to be a powerful alternative to services like who.is.

**Version:** 1.2.0 · **Live demo:** [https://domainpeek.xyz](https://domainpeek.xyz)

## 🚀 Features

### Core Analysis Engine
- **WHOIS & RDAP Lookup**: Domain registration for **all IANA-listed TLDs** (legacy and new gTLDs like `.xyz`, `.fans`, `.app`, `.io`, `.ai`, …). RDAP uses the live [IANA RDAP bootstrap](https://data.iana.org/rdap/dns.json); WHOIS uses registry servers plus IANA referral. Thin or missing WHOIS fields (dates, status, NS) are filled from RDAP. Entity jCards are flattened (`fn` / `org` / `email` / `tel` / `addr`) so contacts render correctly; top-level `ldhName`, `unicodeName`, `port43`, `links`, and `secureDNS`/DS records are exposed in the UI. Dates display as **DD/MMM/YYYY** (plus **HH:MM:SS** when the source includes a real time) in UTC by default, with a toggle for your local timezone.
- **DNS Record Analysis**: Complete DNS resolution including A, AAAA, MX, TXT, CNAME, SOA, NS, PTR records
- **Nameserver Health Checks**: Monitor nameserver response times and availability
- **ASN & IP Intelligence**: ip-api.com + bgp.he.net prefix checks (backend-only, Redis-cached, throttled)
- **User Environment Detection**: Client public IP / ISP via `/api/client-env` (backend geo only)
- **TLS / SAN deep links**: Live certificate probe, SAN analyze-links, Cloudflare Origin CA heuristics, optional CT (crt.sh)
- **Entity graph**: Memgraph (Docker) + Redis relation index; `/entity/...` and `/api/relations/*`

### Security & Best Practices
- **Security Scoring Engine**: Weighted scoring system (0-100) based on domain configuration
- **DNSSEC Validation**: Check for DNS Security Extensions implementation
- **Email Security Analysis**: SPF, DMARC, and common DKIM selector discovery
- **SSL/TLS Integration**: Live leaf-certificate probe (SANs, fingerprint, Origin CA heuristics) with security scoring
- **Best Practice Recommendations**: Actionable insights for domain optimization

### Interactive Visualizations
- **D3.js Powered Charts**: Interactive domain relationship graphs and score breakdowns
- **Theme-Aware Design**: Automatic light/dark theme adaptation for all visualizations
- **Security Score Charts**: Bar charts with weighted security category breakdowns
- **Risk Distribution**: Pie charts showing risk level distribution across categories
- **Domain Timeline**: Interactive timeline of domain events with zoom/pan capabilities
- **Network Topology**: Force-directed graphs showing domain infrastructure relationships
- **Performance Analytics**: Real-time response time charts and availability metrics
- **Domain Hierarchy Visualization**: Root → Nameservers → Records → IPs mapping
- **Health Status Indicators**: Color-coded visual representation of domain health
- **Live DNS Monitoring**: After analyze, the UI subscribes over Socket.IO for real DNS change / TTL alerts (nginx proxies `/socket.io/` in production)

### Export & Sharing
- **Multiple Export Formats**: JSON, CSV, and PDF reports — CSV/PDF include RDAP (entities, events, DNSSEC, links) with the same DD/MMM/YYYY date formatting as the UI
- **Dashboard analyze path**: The web UI loads via a single `/api/analyze` call (no duplicate WHOIS/RDAP/DNS fetches); partial-result notes use `meta.warnings` on compact cards
- **Cached results**: Redis/memory hits return `meta.cached` (+ `meta.cachedAt`); UI shows a Cached badge; **Refresh** uses `?noCache=1` (stampede-locked) for a live re-run
- **Private analyze**: Opt out of the public feed with `?private=1` / UI checkbox — still snapshottable and shareable via deliberate share links
- **Recent feed**: `/recent` and `GET /api/recent` list the last 50 unique **announced** domains with shareable snapshot links
- **Share Links**: Server-backed temporary shareable analysis snapshots (`/share/[token]`) plus `?domain=` deep links
- **Deep links stay put**: Entity / NS / registrar / cert / SAN / ASN links open in a **new browser tab** so the current analysis dashboard is preserved
- **Ops list (internal)**: `npm run list:analyzed` (or `docker compose exec backend npm run list:analyzed`) lists all analyses including private + cache status — not a public API
- **API Access**: RESTful API for programmatic access (optional `API_KEY` via `X-API-Key` or Bearer + nginx nonce in production); site vs script rate budgets
- **Webhook Integration**: Outbound webhooks + entity watchlists (`/api/monitoring/watch`)

## 🏗️ Architecture

This project follows a monorepo structure with separate frontend and backend applications:

```
domain-intelligence-analyzer/
├── apps/
│   ├── frontend/              # Next.js 15 with React 19
│   └── backend/               # Express.js with TypeScript
├── scripts/
│   └── generate-api-key.mjs   # Generate/autofill API_KEY (also ./deploy.sh -k/-K)
├── docker-compose.yml         # Main Docker orchestration
├── docker-compose.override.yml # Docker health check fixes
├── docker-compose.dev.yml     # Development overrides
├── docker/nginx/              # Custom nginx image + nginx.conf template (API_KEY)
└── deploy.sh                  # Automated deployment script
```


### Tech Stack

**Frontend**
- Next.js 15.5.27 with App Router (patched 15.5.x line)
- React 19 with TypeScript
- TailwindCSS 4 for styling
- D3.js for interactive data visualizations
- Theme-aware chart system with automatic light/dark mode switching
- React Query for data fetching
- Framer Motion for UI animations
- next-themes for seamless theme management
- `jspdf` ^4.2.1 for PDF export

**Backend**
- Express.js ^4.22.3 with TypeScript
- Redis for caching and session management
- `whoiser` (WHOIS + IANA TLD list), `tldts` (public suffix), `axios` ^1.20 RDAP client
- OpenAPI/Swagger documentation
- Jest unit tests + TLD smoke script
- Docker containerization

## 🚦 Getting Started

Try the hosted app at **[domainpeek.xyz](https://domainpeek.xyz)** or run locally:

### Prerequisites

- Node.js >= 22.0.0
- npm >= 8.0.0
- Docker & Docker Compose V2 (optional, for local development / production containers)
- Redis (Docker profile `redis` or `default`; local npm run falls back to in-memory cache if unset)

If Docker is missing on a Linux host, `./deploy.sh` can install it via [get.docker.com](https://get.docker.com) and add your user to the `docker` group so commands run without `sudo`.

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/kyroskoh/domain-intelligence-analyzer.git
   cd domain-intelligence-analyzer
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   # App-local env (both apps use .env — templates match ./deploy.sh -p nginx)
   cp apps/frontend/.env.example apps/frontend/.env
   cp apps/backend/.env.example apps/backend/.env
   # Optional root compose/deploy env
   cp .env.example .env
   ```

   Templates prefer `https://domainpeek.xyz` for browser API/CORS. For pure local
   API (`npm run dev:backend`), set frontend `NEXT_PUBLIC_API_*` to `http://localhost:4001`.

4. **Start development servers**
   ```bash
   # Start both frontend and backend
   npm run dev
   
   # Or start individually
   npm run dev:frontend  # http://localhost:4000
   npm run dev:backend   # http://localhost:4001
   ```

### Using Docker (Recommended for Production)

**Quick Start:**
```bash
# Clone and start with Docker
git clone https://github.com/kyroskoh/domain-intelligence-analyzer.git
cd domain-intelligence-analyzer

# Recommended (production): Nginx + Redis, API key, pull base images, auto cache
# Installs Docker if missing. Equivalent profiles: -p nginx -p redis -p graph
./deploy.sh -p default -k -u

# Core only (frontend + backend), or other profiles
./deploy.sh
./deploy.sh -p redis
./deploy.sh -p graph
./deploy.sh -p nginx -k

# Or manage Compose directly
docker compose up --build                              # core only
docker compose --profile redis up --build              # + Redis
docker compose --profile graph up --build              # + Memgraph
docker compose --profile nginx up --build              # + Nginx
docker compose --profile default up --build            # + Nginx + Redis + Memgraph
```

**Development with Docker:**
```bash
# Start in development mode with hot reload (core)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Or use the deployment script
./deploy.sh --environment development

# Stop all services
docker compose down

# View logs
docker compose logs -f

# Optional profiles: redis | nginx | graph | default (nginx + redis + memgraph)
mkdir -p ssl
./deploy.sh -p default -k -u         # recommended production stack
./deploy.sh -p redis                 # cache / rate-limit / snapshots / share
./deploy.sh -p graph                 # Memgraph relation graph (Bolt :7687)
./deploy.sh -p nginx -k              # reverse proxy
```

For HTTPS with Let's Encrypt (Cloudflare DNS-01; Alpine package `certbot-dns-cloudflare`), set in `.env` before starting nginx:

```bash
DOMAIN_NAME=domainpeek.xyz
CERTBOT_DOMAINS=www.domainpeek.xyz
CERTBOT_EMAIL=you@example.com
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token   # Zone:DNS:Edit — do not commit
```

See [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md#sslhttps-setup) for full TLS setup.

**Available services:**
- Frontend: `http://localhost:4000`
- Backend API: `http://localhost:4001`
- Redis: `localhost:6379` (with `-p redis` or `-p default`)
- Memgraph: Bolt `localhost:7687` (with `-p graph` or `-p default`; Redis relation fallback if omitted)
- API Documentation: `http://localhost:4001/docs`
- Health Checks: `http://localhost:4000/api/health` & `http://localhost:4001/health`
- With nginx / default profile: `http://localhost/` (port 80) and `https://localhost/` (port 443; LE or `./ssl` certs)

For a public VPS, `./deploy.sh` auto-fills `NEXT_PUBLIC_API_BASE_URL` / `NEXT_PUBLIC_API_URL` (`https://$DOMAIN_NAME` with `-p nginx` or `-p default`, otherwise `http://<ip>:4001`) and passes them as frontend build args. It also merges `CORS_ORIGINS` for localhost, **domainpeek.xyz**, and the host IPv4 from `ip a`. Override with `PUBLIC_API_URL=...`. See [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md).

### Docker Troubleshooting

**Common Issues & Solutions:**

1. **Network iptables error on Windows:**
   ```bash
   # If you see iptables errors, the fix is already included
   # Uses default Docker networking instead of custom bridge
   docker compose down && docker compose up --build
   ```

2. **Frontend can't connect to backend / UI shows Offline remotely:**
   ```bash
   # Backend may be fine while the browser still calls localhost:4001
   curl http://localhost:4001/health
   curl https://domainpeek.xyz/health

   # Fix: let deploy.sh rewrite NEXT_PUBLIC_API_* and rebuild
   ./deploy.sh -p nginx -r
   # Or: PUBLIC_API_URL=https://domainpeek.xyz ./deploy.sh -p nginx -r
   ```

3. **Nginx container missing after `docker compose up`:**
   ```bash
   # Nginx is opt-in via Compose profile (builds docker/nginx with Certbot)
   mkdir -p ssl
   docker compose --profile nginx up --build -d
   ```

   For auto TLS, also set `DOMAIN_NAME`, `CERTBOT_EMAIL`, and `CLOUDFLARE_API_TOKEN` in `.env`.

4. **Build hangs on Alpine `apk` / flaky Docker egress (Linux VPS):**
   ```bash
   # Often Docker bridge MTU — see DOCKER_DEPLOYMENT.md troubleshooting
   # Quick daemon settings: dns + mtu 1400, then systemctl restart docker
   ```

5. **Domain analysis fails:**
   ```bash
   # Test backend directly
   curl http://localhost:4001/api/analyze/google.com

   # Should return comprehensive domain data
   ```

6. **Services won't start:**
   ```bash
   # Clean up and rebuild
   docker compose down
   docker system prune -f
   docker compose up --build
   ```

**Health Check Commands:**
```bash
# Check container status
docker compose ps

# View logs
docker compose logs -f

# Test connectivity
curl http://localhost:4000/api/health
curl http://localhost:4001/health
```

## 📊 Usage

### Web Interface

1. **Navigate to the application** at `http://localhost:4000`
2. **Enter a domain name** in the search box (e.g., `example.com`)
3. **View comprehensive analysis** including:
   - Domain registration details (WHOIS/RDAP contacts, dates, links, DNSSEC)
   - DNS record breakdown
   - Security score and recommendations
   - Interactive theme-aware visualizations
   - Nameserver health status
   - Export options in JSON, CSV, and PDF (RDAP included)

#### Testing Chart Themes

Visit `http://localhost:4000/test-charts` to test all visualization components with theme switching capabilities.

### API Usage

```bash
# Analyze a domain (also persists a Redis snapshot when Redis is up)
curl -X GET "http://localhost:4001/api/analyze/example.com"

# Force a live re-run (bypass cache)
curl -X GET "http://localhost:4001/api/analyze/example.com?noCache=1"

# Private analyze (omit from public recent feed)
curl -X GET "http://localhost:4001/api/analyze/example.com?private=1"

# Announced recent feed (unique domains, max 50)
curl -X GET "http://localhost:4001/api/recent"

# Snapshot history (announced only) / temporary share link
curl -X GET "http://localhost:4001/api/history/example.com"
curl -X POST "http://localhost:4001/api/share" -H "Content-Type: application/json" -d "{\"domain\":\"example.com\"}"

# Get DNS records only
curl -X GET "http://localhost:4001/api/dns/example.com"

# Ops: list all analyzed domains (incl. private) — host/Docker only
npm run list:analyzed
npm run list:analyzed -- --json --limit=50
# docker compose exec backend npm run list:analyzed
```

Optional loopback HTTP (off by default): set `INTERNAL_ANALYZED_LIST=1` and call `GET /api/internal/analyzed` from localhost (add `ALLOW_DOCKER_INTERNAL_LIST=1` for Docker bridge). Requests with `X-Forwarded-For` are rejected.

### API Documentation
Visit `http://localhost:4001/docs` for interactive Swagger documentation.

## 🎨 Theme System

### Automatic Theme Adaptation

The application features a comprehensive theme system that automatically adapts all visualizations and UI components for optimal viewing in both light and dark modes.

#### Chart Theme Features
- **Real-time Switching**: Charts instantly adapt when users toggle between light/dark themes
- **Proper Contrast**: All text and visual elements maintain proper contrast ratios for accessibility
- **Color Consistency**: Uses a unified color palette across all D3.js visualizations
- **Background Adaptation**: Chart backgrounds, tooltips, and panels automatically adjust

#### Supported Components
- Security Score Charts (bar charts with category breakdowns)
- Risk Level Pie Charts (risk distribution visualization)
- Domain Timeline Charts (interactive timeline with zoom/pan)
- Network Topology Diagrams (force-directed graph layouts)
- Performance Analytics Charts (response time and availability metrics)
- Security Trend Charts (historical security score tracking)

#### Theme Testing

Visit `/test-charts` to interactively test all chart components:

```bash
# Start development server
npm run dev

# Navigate to theme testing page
# http://localhost:4000/test-charts
```

### Technical Implementation

The theme system uses:
- `useChartColors()` React hook for real-time theme detection
- CSS custom properties for seamless theme transitions
- D3.js dynamic color application for SVG elements
- next-themes integration for persistent theme preferences

## 🧪 Testing

### Automated Testing

```bash
# Run all workspace tests
npm test

# Backend unit tests (WHOIS/RDAP/analysis)
npm run test --workspace=@domainpeek/backend

# Backend coverage
npm run test:coverage --workspace=@domainpeek/backend

# TLD smoke checks (IANA list + optional live API)
# Start backend first for HTTP checks: npm run dev:backend
npm run smoke:tlds --workspace=@domainpeek/backend
```

Backend suites cover:
- IANA RDAP bootstrap loading and new gTLD availability (`.xyz`, `.fans`, `.app`, …)
- WHOIS parsing, server overrides, and `whoiser` integration
- Parallel RDAP ∥ WHOIS ∥ DNS analysis; WHOIS gaps filled from RDAP; RDAP timeout soft-fail (no same-server retry; transient soft-fails not cached)

### Interactive Chart Testing

```bash
# Start development server
npm run dev

# Visit chart testing page
# http://localhost:4000/test-charts
```

The test page includes:
- All visualization components with mock data
- Theme toggle for testing light/dark mode transitions
- Interactive elements to verify responsiveness
- Performance monitoring for chart rendering

## 🛠️ Development

### Project Structure

```
apps/frontend/src/
├── app/                   # Next.js App Router pages
│   └── test-charts/       # Chart testing and theme validation page
├── components/            # Reusable React components
│   ├── analysis/          # Domain analysis components
│   ├── theme/             # Theme management components
│   ├── ui/                # Base UI components
│   └── visualizations/    # D3.js visualization components (theme-aware)
├── hooks/                 # Custom React hooks
├── lib/                   # Utility functions and API clients
│   └── chart-colors.ts    # Theme-aware color system for charts
└── types/                 # TypeScript type definitions
apps/backend/src/
├── routes/                # Express route handlers (analyze, whois, rdap, dns, …)
├── services/              # Business logic
│   ├── whois/             # WHOIS via whoiser (all IANA TLDs)
│   ├── rdap/              # RDAP + IANA dns.json bootstrap
│   ├── dns/               # DNS resolution
│   └── security/          # Security scoring
├── middleware/            # Express middleware
├── scripts/               # Smoke / ops scripts
└── types/                 # TypeScript interfaces
```

### Available Scripts

```bash
# Development
npm run dev              # Start both apps in development mode
npm run dev:frontend     # Start only frontend
npm run dev:backend      # Start only backend

# Building
npm run build            # Build both apps for production
npm run build:frontend   # Build frontend only
npm run build:backend    # Build backend only

# Testing
npm test                 # Run all tests
npm run test:frontend    # Test frontend only
npm run test:backend     # Test backend only

# Code Quality
npm run lint             # Lint all code
npm run format           # Format code with Prettier
npm run type-check       # TypeScript type checking

# Docker
npm run docker:build     # Build Docker images
npm run docker:build:nocache  # Cold rebuild (DOCKER_BUILD_NO_CACHE=true)
npm run docker:up        # Start services with Docker Compose
npm run docker:down      # Stop Docker services

# Secrets
npm run generate:api-key              # Generate API_KEY → root + backend .env
npm run generate:api-key -- --local   # Also set NEXT_PUBLIC_API_KEY (local/dev)
npm run generate:api-key -- --force   # Rotate existing key
```

## 🔧 Configuration

### Environment Variables

**Backend (`apps/backend/.env`)** — see [`apps/backend/.env.example`](apps/backend/.env.example):
```env
PORT=4001
NODE_ENV=development
WHOIS_TIMEOUT_MS=10000
WHOIS_FOLLOW=2
RDAP_TIMEOUT_MS=25000
DNS_TIMEOUT_MS=5000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
CORS_ORIGINS=http://localhost:4000,https://domainpeek.xyz,http://domainpeek.xyz,https://www.domainpeek.xyz,http://www.domainpeek.xyz
# When set, /api/* and Socket.IO require API key (X-API-Key or Bearer) + X-Request-Nonce (/health exempt)
# API_KEY=
```

RDAP lookups run in parallel with WHOIS/DNS. On timeout the server tries the next bootstrap URL (no same-server retry), then soft-fails with a warning while WHOIS/DNS still return. Transient RDAP soft-fails are not cached.

**API key + nginx nonce:** Set the same `API_KEY` in root `.env` (passed to backend and nginx). With `./deploy.sh -p nginx`, nginx injects `X-API-Key`, `Authorization: Bearer <API_KEY>`, and a per-request `X-Request-Nonce` (`$request_id`) on `/api/` and `/socket.io/`. Direct clients may send either `X-API-Key` or `Authorization: Bearer` (plus nonce); hits to `:4001` without a valid key return `401`. For local `npm run dev` without nginx, either leave `API_KEY` unset or set matching `API_KEY` (backend) and `NEXT_PUBLIC_API_KEY` (frontend sends both key headers + nonce, local only).

Generate and autofill a key (creates `.env` from examples when missing):

```bash
npm run generate:api-key              # root + apps/backend/.env
npm run generate:api-key -- --local   # also NEXT_PUBLIC_API_KEY for local/dev
npm run generate:api-key -- --force   # rotate an existing key

# Or during deploy (same generator / openssl fallback):
./deploy.sh -p nginx -k              # generate API_KEY if missing
./deploy.sh -p nginx -K -r           # rotate API_KEY and rebuild
```

**Frontend (`apps/frontend/.env`)** — see [`apps/frontend/.env.example`](apps/frontend/.env.example):
```env
# Preferred (matches ./deploy.sh -p nginx). Use http://localhost:4001 for local API only.
NEXT_PUBLIC_API_BASE_URL=https://domainpeek.xyz
NEXT_PUBLIC_API_URL=https://domainpeek.xyz
INTERNAL_API_URL=http://localhost:4001
NEXT_PUBLIC_APP_ENV=development
# Local without nginx only (must match backend API_KEY). Leave unset in production.
# NEXT_PUBLIC_API_KEY=
```

**Root (`.env`)** — used by Docker Compose / `./deploy.sh` (see [`.env.example`](.env.example)). Prefer `./deploy.sh` for production: it merges CORS, sets `DOMAIN_NAME=domainpeek.xyz`, writes `NEXT_PUBLIC_API_*`, and bakes them into the frontend image (do not use `http://backend:4001` for browser-facing URLs). Set `API_KEY` before enabling the nginx profile so the proxy and backend share the secret.

### Docker Configuration

**docker-compose.override.yml** (automatically loaded):
```yaml
services:
  frontend:
    # Improved health check that doesn't rely on HTTP endpoints
    healthcheck:
      test: ["CMD-SHELL", "node -e \"require('net').connect({host:'127.0.0.1',port:4000}).on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))\""]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 60s
```

**Key Docker Features:**
- **Node.js 22 LTS**: Frontend and backend images use `node:22-alpine`
- **Optional profiles**: `redis` (cache / rate-limit / snapshots / share), `graph` (Memgraph), `nginx` (reverse proxy), `default` (nginx + redis + memgraph); core stack is frontend + backend; `./deploy.sh` autofills Redis env when missing; set `GRAPH_BOLT_URL` / `GRAPH_ENABLED` for the graph service
- **Smart build cache**: `./deploy.sh` auto no-cache on Dockerfile/lockfile/compose changes; cached rebuild for source/`NEXT_PUBLIC_*`; override with `-r`/`--no-cache` or `-c`/`--cache` (`-u` pulls base images)
- **Default Networking**: Uses Docker's default bridge network to avoid iptables issues on Windows
- **Health Checks**: Custom Node.js-based health checks for better reliability
- **Service Communication**: Browser calls the public API origin (`NEXT_PUBLIC_API_*`); container health uses `INTERNAL_API_URL=http://backend:4001`
- **Production Ready**: Optimized Docker builds with multi-stage compilation

## 🚀 Deployment

### Production Build

```bash
# Build for production
npm run build

# Start production servers
npm run start
```

### Docker Production

```bash
# Recommended (production): Nginx + Redis + API key + pull bases + auto cache
mkdir -p ssl
./deploy.sh -p default -k -u

# Core only / other profiles
docker compose up --build -d
./deploy.sh -p redis
./deploy.sh -p nginx -k
# equivalent full stack without -k/-u: ./deploy.sh -p default
# or: docker compose --profile default up --build -d

# Verify deployment health
curl http://localhost:4000/api/health
curl http://localhost:4001/health
# With nginx|default profile:
curl http://localhost/health
```

**Production notes:**
- `./deploy.sh` auto-fills `NEXT_PUBLIC_API_*` (build args) and merges `CORS_ORIGINS`
- Optional overrides: `PUBLIC_API_URL=...`, `PUBLIC_HOST=<ip>`
- Build cache: auto by default; force cold with `-r`/`--no-cache`, force cache with `-c`/`--cache`; add `-u` to pull newer base images
- Set `API_KEY` in `.env` before `-p nginx` / `-p default` so nginx and backend share the secret (injected as `X-API-Key` + `Authorization: Bearer` + `X-Request-Nonce`)
- Nginx TLS: set `DOMAIN_NAME`, `CERTBOT_EMAIL`, `CLOUDFLARE_API_TOKEN` (optional `CERTBOT_DOMAINS`) for Let's Encrypt via Cloudflare DNS-01
- On Linux hosts with hung Alpine `apk` during build, configure Docker `mtu: 1400` (see [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md))
- Keep `/etc/docker/daemon.json` MTU/DNS settings if they were required on your host

### Cloud Deployment

The application is designed to be deployed on:
- **Vercel** (Frontend)
- **Railway/Render** (Backend)
- **Redis Cloud** (Cache)
- **Docker containers** on any cloud provider

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript strict mode
- Write tests for new features
- Use conventional commit messages
- Ensure code passes linting and formatting checks
- Update documentation for API changes

## 📈 Roadmap

### Phase 1: Core MVP (Current)
- [x] Basic project setup and architecture
- [x] Interactive D3.js visualizations with theme support
- [x] Theme-aware chart system (light/dark mode)
- [x] Security scoring system
- [x] Export functionality (JSON, CSV, PDF)
- [x] WHOIS/RDAP lookup engine (all IANA TLDs / new gTLDs)
- [x] Dedicated `/api/whois` and `/api/rdap` routes wired to services
- [x] DNS analysis engine
- [x] Complete web interface integration
- [x] Domain topology network visualizations
- [x] Security threat analysis and scoring
- [x] Live demo at [domainpeek.xyz](https://domainpeek.xyz)

### Phase 2: Advanced Features
- [x] Interactive D3.js visualizations
- [x] Advanced export options (multiple formats)
- [x] Theme-aware UI components
- [x] Network topology diagrams
- [x] Real-time monitoring (Socket.IO + nginx `/socket.io/`)
- [x] WHOIS←RDAP date/status/NS enrichment + DD/MMM/YYYY (+ time) with UTC/Local toggle
- [x] API rate limiting (Express + nginx)
- [x] API key via nginx (`X-API-Key` + `Authorization: Bearer` + `X-Request-Nonce`); direct `:4001` rejected when `API_KEY` is set
- [x] Historical data tracking (Redis snapshots; SecurityTrendChart loads `/api/history`)
- [x] Analysis snapshot store (Redis/DB) for trends, timeline, and future share links
- [x] Parse RDAP entity vCards in API + UI (contacts not “Unknown”)
- [x] Map RDAP top-level fields (`ldhName`, `unicodeName`, `port43`, `links`)
- [x] Fix WHOIS expiry badge for invalid dates; format registrant contact objects
- [x] Export CSV/PDF include RDAP; align date formatting with UI
- [x] Prefer `/api/analyze` on dashboard; drop duplicate WHOIS/RDAP/DNS fetches
- [x] Real DNSSEC check + SRV lookup in DNS service
- [x] Health checks: real Redis ping
- [x] Health checks: WHOIS service probe (port43 TCP to whois.iana.org)
- [x] Wire Redis store for Express rate limiting (enable with `-p redis` or `-p default`)
- [x] Trim CORS origin list entries
- [x] Frontend unit tests for entity deep-link helpers
- [x] SSL/TLS certificate probe (replace mock SSL metrics; score beyond CAA)
- [x] Surface `secureDNS` / DS records in RDAP UI
- [x] Consistent `meta.warnings` on compact analysis cards
- [x] Harden RDAP timeouts (25s default, no same-server retry, skip caching transient soft-fails)
- [ ] User JWT / multi-tenant API keys (beyond shared nginx `API_KEY`)

### Phase 3: Enterprise Features
- [x] ASN / IP geolocation (ip-api + bgp.he.net; gated egress)
- [x] User environment detection (client public IP / ISP)
- [x] DKIM selector discovery
- [x] Server-backed temporary shareable analysis links
- [x] Multi-domain bulk analysis (`POST /api/analyze/bulk`)
- [x] Custom alerting and webhooks (outbound; in-app Socket.IO alerts already exist)
- [ ] Integration with external security feeds
- [ ] White-label deployment options
- [x] Advanced analytics dashboard (real metrics only — no mock generators)

### Phase 3 — Intelligence Graph & Entity Deep Links
Progress tracker for entity deep links, TLS/SAN, ASN/BGP, Memgraph relations, and related gaps.

#### Foundations
- [x] Remove production mock metrics (PerformanceAnalytics); real data only or omit
- [x] Site vs script rate limits + backend-only third-party egress (throttle/cache per provider)
- [x] Memgraph in docker-compose (profiles `graph` / `default`); `GRAPH_BOLT_URL`; Redis fallback
- [x] Hydrate inbound `?domain=` / `focus` / `id`; topology URL sync

#### TLS, DNS, ASN
- [x] SSL/TLS certificate probe + SAN extraction; real SSL security scoring; `GET /api/ssl/:domain`
- [x] Shared-SAN index; Cloudflare Origin CA heuristics; opt-in throttled CT (crt.sh)
- [x] AsnGeoService: ip-api.com + bgp.he.net IPv4/IPv6 prefix checks (Redis-cached, gated)
- [x] Real DNSSEC validation + SRV lookup in DNS service
- [x] DKIM selector discovery
- [x] User environment detection (client IP/ISP via backend only)

#### Graph, relations, entities
- [x] Extended analysis snapshot / share payload (registrar, NS, cert, ASN; redaction)
- [x] EntityRelationStore: Redis hot index + Memgraph Cypher upsert/query
- [x] Reverse-lookup APIs `/api/relations/*` (ns, registrar, cert, san, asn, prefix, entity)
- [x] First-class `/entity/{type}/{id}` pages
- [x] RDAP `links[]` follow (capped/cached); IANA registrar IDs / stable handles
- [x] PII / co-tenant redaction on shares and relation responses
- [x] UI deep links (WHOIS/RDAP/DNS/SSL/topology/share) + `entityLinks` helper

#### Platform
- [x] Multi-domain bulk analyze (capped; site-budget / API key for scripts)
- [x] Entity watchlists (NS/registrar/cert/ASN) + outbound webhooks
- [x] WHOIS health probe; frontend unit tests for new helpers; export includes SSL/ASN/relations summary
- [x] Real analytics aggregates from snapshots/graph (no mock generators)
- [x] Server-backed temporary shareable analysis links

#### Deferred
- Separate entity microservice; paid Cloudflare zone/cert API; ownership claims from SAN/CT; white-label; full multi-tenant JWT; full passive CT corpus; alternate graph engines (Memgraph only)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📦 Key libraries (maintained)

| Concern | Package | Notes |
|---------|---------|--------|
| RDAP bootstrap / PSL | `tldts`, `axios` ^1.20 | Full IANA `dns.json` bootstrap cached under `apps/backend/data/` |
| WHOIS | `whoiser` (^1.18) | Maintained; IANA auto-discovery + `allTlds()` for every delegated gTLD/ccTLD |
| Frontend framework | `next` 15.5.27, `eslint-config-next` 15.5.27 | Stay on patched 15.5.x (not Next 16) |
| PDF export | `jspdf` ^4.2.1 | Client-side reports |
| HTTP API | `express` ^4.22.3 | Stay on Express 4 |
| Dev runner | `tsx` | Replaces deprecated/unmaintained `ts-node-dev` |
| HTTP tests | `supertest` ^7 | Current major; avoid deprecated v6 |
| Validation | `joi` ^17.13.8 (built-in types) | Removed deprecated `@types/joi` / `@types/socket.io` |

Removed unused `rdap-client` (unmaintained install scripts). Prefer RDAP via IANA bootstrap + axios.

### Dependency security

Root `package.json` uses npm `overrides` to pin patched transitive versions (`postcss`, `sharp`, `ws`, `tar`, `proxy-addr`, `shell-quote`, and related). After `npm install`, run `npm audit` — critical/high should be clear. Residual moderate findings may remain in the Jest → `sprintf-js` chain (no patched `sprintf-js` release yet; do not force-downgrade `ts-jest`/`jest`).

## 🙏 Acknowledgments

- Built with inspiration from [who.is](https://who.is)
- Live demo: [domainpeek.xyz](https://domainpeek.xyz)
- Uses open-source DNS and WHOIS data sources
- Leverages [IANA RDAP bootstrap](https://data.iana.org/rdap/dns.json) for all RDAP-capable TLDs
- Community feedback and contributions

## 📞 Support

- 📧 Email: support@domainpeek.com
- 🐛 Issues: [GitHub Issues](https://github.com/kyroskoh/domain-intelligence-analyzer/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/kyroskoh/domain-intelligence-analyzer/discussions)

---

Made with ❤️ by [Kyros Koh](https://github.com/kyroskoh)