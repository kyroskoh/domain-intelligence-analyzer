# Docker Deployment Guide

This document provides comprehensive instructions for deploying DomainPeek **1.3.1** using Docker and Docker Compose (nginx, Redis, and optional Memgraph for entity relations). See [CHANGELOG.md](./CHANGELOG.md) for release notes.

## Prerequisites

- Docker Engine 20.10+ with the Compose V2 plugin (`docker compose`)
- Node.js 22 LTS (container base image: `node:22-alpine`)
- At least 2GB RAM available for containers (add ~512MB when using the Memgraph `graph` / `default` profile)
- 5GB disk space for images and data
- `sudo` access on the host (only if Docker needs to be installed)

### Installing Docker (if missing)

If Docker is not installed on the host, install it with the official convenience script, then add your user to the `docker` group so you can run Docker without `sudo`:

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker "$USER"
# Apply the new group in the current shell (or log out and back in)
newgrp docker
```

`./deploy.sh` performs these steps automatically when Docker is missing: it installs Docker via `get.docker.com`, adds the current user to the `docker` group, starts the daemon if needed, and re-runs under that group so the rest of the deploy can continue without `sudo`.

## Quick Start

### 1. Clone and Setup

```bash
git clone <repository-url>
cd domain-intelligence-analyzer

# Root compose/deploy env (DOMAIN_NAME, CORS, NEXT_PUBLIC_API_*, Certbot, …)
cp .env.example .env
# Edit .env with your configuration

# Optional: local npm run without Docker (both apps use .env)
# cp apps/frontend/.env.example apps/frontend/.env
# cp apps/backend/.env.example apps/backend/.env

# Optional: generate shared API_KEY now (also done by ./deploy.sh -k)
# npm run generate:api-key
```

Preferred nginx profile host is `DOMAIN_NAME=domainpeek.xyz` (browser API `https://domainpeek.xyz`).

### 2. Production Deployment

```bash
# Recommended (production): Nginx + Redis, generate API_KEY if missing,
# pull latest base images, auto cache (no-cache only when cold inputs change).
# Also auto-fills NEXT_PUBLIC_API_* + CORS_ORIGINS; installs Docker if needed.
./deploy.sh -p default -k -u

# Other common variants
./deploy.sh                         # core: frontend + backend
./deploy.sh -p redis                # + Redis
./deploy.sh -p nginx -k             # + Nginx only
./deploy.sh -p default -K -r        # rotate API_KEY + cold rebuild

# Or manage Compose directly (set NEXT_PUBLIC_API_* / API_KEY in .env yourself first)
docker compose --profile default up --build -d

# Check service status
docker compose ps

# View logs
docker compose logs -f
```

### 3. Development Deployment

```bash
# Start with development overrides
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Follow logs
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f
```

## Configuration

### Environment Variables

Key environment variables in `.env`:

```bash
# Application
NODE_ENV=production

# Browser-facing API base URL (baked into the Next.js client at build time).
# Prefer ./deploy.sh — it auto-fills both from DOMAIN_NAME (nginx) or PUBLIC_HOST.
# Manual override only if you skip deploy.sh:
NEXT_PUBLIC_API_BASE_URL=http://localhost:4001
NEXT_PUBLIC_API_URL=http://localhost:4001

# Backend
PORT=4001
LOG_LEVEL=info

# Lookup timeouts (ms) — passed through to the backend container
WHOIS_TIMEOUT_MS=10000
RDAP_TIMEOUT_MS=25000
DNS_TIMEOUT_MS=5000

# Security — include every origin users will open in a browser
# ./deploy.sh auto-merges localhost, domainpeek.xyz (http/https + www), http://<ip-from-ip-a>[:4000]
# Optional override: PUBLIC_HOST=<ip> ./deploy.sh
CORS_ORIGINS=http://localhost:4000,http://frontend:4000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Shared backend + nginx secret (prefer: ./deploy.sh -k or npm run generate:api-key)
# When set, /api/* and Socket.IO require API key (X-API-Key or Bearer) + X-Request-Nonce (/health exempt)
# API_KEY=

# Redis (used with -p redis or -p default; ./deploy.sh autofills when missing)
REDIS_URL=redis://redis:6379
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_TTL_SECONDS=3600
SNAPSHOT_TTL_SECONDS=2592000
SHARE_TTL_SECONDS=604800
# REDIS_PASSWORD=your_password   # backend merges into REDIS_URL if URL has no auth

# Optional: enable profiles without CLI flags
# COMPOSE_PROFILES=redis
# COMPOSE_PROFILES=nginx
# COMPOSE_PROFILES=default
```

**Public VPS / remote browser access:** `./deploy.sh` auto-writes `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_API_URL` before building the frontend image:

| Deploy mode | Auto-filled browser API origin |
|-------------|-------------------------------|
| `./deploy.sh -p nginx` or `-p default` | `https://$DOMAIN_NAME` (default `https://domainpeek.xyz`) |
| `./deploy.sh` / `-p redis` (no nginx) | `http://<detected-ip>:4001` |
| Override | `PUBLIC_API_URL=https://example.com ./deploy.sh -p default -r` |

Do **not** use `http://backend:4001` for those variables — that hostname only resolves inside the Docker network. They are passed as Docker **build args**; changing them in a running container alone has no effect — rebuild (`-r`) after a change.

`./deploy.sh` also merges `CORS_ORIGINS` automatically: `http://localhost:4000`, `http(s)://domainpeek.xyz`, `http(s)://www.domainpeek.xyz`, plus `http://<first-global-ipv4>` and `http://<first-global-ipv4>:4000` from `ip -4 addr` (`ip a`). Existing origins are kept. Override the detected IP with `PUBLIC_HOST=<ip>` only when needed.

### Service Profiles

A plain `docker compose up --build` starts **core** services only (`frontend` + `backend`). Redis and Nginx are **opt-in profiles**.

| Profile | Starts |
|---------|--------|
| *(none)* | frontend, backend |
| `redis` | + Redis |
| `nginx` | + Nginx |
| `default` | + Nginx + Redis |

```bash
# Recommended: full stack (nginx + redis) + API key + pull base images + auto cache
mkdir -p ssl   # nginx mounts ./ssl; create before first -p default|-p nginx run
./deploy.sh -p default -k -u

# Core stack
docker compose up --build -d
./deploy.sh

# Redis only (cache / rate-limit / snapshots / share links)
docker compose --profile redis up --build -d
./deploy.sh -p redis

# Nginx reverse proxy (create ./ssl first — compose mounts it rw)
# For Let's Encrypt + Cloudflare, also set DOMAIN_NAME, CERTBOT_EMAIL,
# CLOUDFLARE_API_TOKEN (and optional CERTBOT_DOMAINS) in .env — see SSL section.
docker compose --profile nginx up --build -d
./deploy.sh -p nginx -k

# Full stack via Compose (same services as -p default; no -k/-u helpers)
docker compose --profile default up --build -d
# equivalent:
./deploy.sh -p nginx -p redis
docker compose --profile nginx --profile redis up --build -d
```

With the `nginx` or `default` profile, open the app on port **80** (`http://YOUR_HOST/`). Ports 4000/4001 remain available for direct access unless you close them in the firewall.

## Service Architecture

### Core Services

1. **Backend** (`backend`)
   - Node.js API server
   - Port: 4001
   - Health check: `/health`
   - Warms IANA RDAP bootstrap + WHOIS TLD list on startup
   - Connects to Redis at `redis://redis:6379` by default

2. **Frontend** (`frontend`) 
   - Next.js web application
   - Port: 4000
   - Health check: `/api/health`

### Optional Services (profiles)

3. **Redis** (`redis`) — profiles: `redis`, `default`

3b. **Memgraph** (`memgraph`) — profiles: `graph`, `default` — Bolt `7687`, env `GRAPH_BOLT_URL=bolt://memgraph:7687`. Without the graph profile, relation APIs fall back to Redis.
   - Persistent cache (`appendonly yes`, volume `redis-data`)
   - Port: 6379
   - Backend uses memory fallback when Redis is not started

4. **Nginx** (`nginx`) — profiles: `nginx`, `default`
   - Reverse proxy (`/` → frontend; `/api/`, `/health`, and `/socket.io/` → backend)
   - `/socket.io/` must hit the backend (WebSocket upgrade + long `proxy_read_timeout`)
     so live DNS monitoring works when `NEXT_PUBLIC_API_*` is the public site origin
   - Ports: 80, 443
   - Profile: `nginx` (not started unless enabled)
   - Custom image (`docker/nginx`) based on `nginx:alpine`; apk installs
     `certbot` and `certbot-dns-cloudflare` (Alpine community package name —
     not `py3-certbot-dns-cloudflare`)
   - Requires `./ssl` directory (empty is fine; Certbot links LE certs here)
   - Persists Let's Encrypt state in the `letsencrypt` volume

## Docker Images

### Multi-stage Build

Both frontend and backend use multi-stage builds based on `node:22-alpine`:

- `deps` - Production dependencies
- `dev` - Development environment
- `builder` - Build stage
- `runner` - Production runtime

`./deploy.sh` **auto-detects** cache vs no-cache (default). Compose reads `DOCKER_BUILD_NO_CACHE` / `DOCKER_BUILD_PULL` on each service `build:` block.

| Trigger | Effect |
|---------|--------|
| *(default)* auto | No-cache only when **cold inputs** change vs `.docker-build-fingerprint` |
| Cold inputs change | Dockerfile / `package.json` / lockfile / `docker/nginx/*` / compose files → `DOCKER_BUILD_NO_CACHE=true` |
| Soft inputs change | `NEXT_PUBLIC_API_*`, profiles, `DOMAIN_NAME` → **cached** rebuild (Docker invalidates ARG/COPY layers) |
| Source-only edits | Cached `docker compose up --build` |
| `./deploy.sh -r` / `--no-cache` | Force cold rebuild |
| `./deploy.sh -c` / `--cache` | Force layer cache (even if cold inputs changed) |
| `./deploy.sh -u` | `DOCKER_BUILD_PULL=true` (refresh `FROM` base images) |
| `DOCKER_BUILD_NO_CACHE=true` env | Same as `-r` when mode is auto |

```bash
# Recommended deploy (auto cache + pull bases)
./deploy.sh -p default -k -u

# Force cold rebuild (e.g. after a bad layer / security bump you want fully clean)
./deploy.sh -p default -k --no-cache -u

# Force cache (skip auto no-cache)
./deploy.sh -p default -c

# Manual
DOCKER_BUILD_NO_CACHE=true docker compose build
docker compose up -d
# equivalent: npm run docker:build:nocache
```

### Image Sizes (Approximate)

- Backend: ~150MB
- Frontend: ~130MB  
- Redis: ~40MB
- Nginx (with Certbot/Cloudflare plugin): ~80MB

## Deployment Scenarios

### 1. Local Development

```bash
# Hot reloading with volume mounts
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Access:
# - Frontend: http://localhost:4000  
# - Backend API: http://localhost:4001
# - API Docs: http://localhost:4001/docs
# Add Redis: append --profile redis (or use ./deploy.sh -e development -p redis)
```

### 2. Production (Basic)

```bash
# Production build with health checks (frontend + backend)
docker compose up --build -d
# + Redis:
docker compose --profile redis up --build -d

# Access:
# - Application: http://localhost:4000
# - API: http://localhost:4001
# - Redis: localhost:6379 (with redis|default profile)
```

### 3. Production with Nginx (+ optional Redis)

```bash
# Nginx only
export COMPOSE_PROFILES=nginx
docker compose up --build -d
# or: ./deploy.sh -p nginx

# Full stack (nginx + redis)
export COMPOSE_PROFILES=default
docker compose up --build -d
# or: ./deploy.sh -p default

# Access:
# - Application: http://localhost (port 80)
# - HTTPS: https://localhost (port 443)
#   Set DOMAIN_NAME, CERTBOT_EMAIL, CLOUDFLARE_API_TOKEN in .env for Let's Encrypt
#   (or place cert.pem/key.pem under ./ssl)
```

## SSL/HTTPS Setup

With the `nginx` profile, TLS is terminated at the custom nginx image (`docker/nginx`). Preferred production path is **Let's Encrypt via Certbot + Cloudflare DNS-01** (works with orange-cloud proxy). The image installs the official Alpine community package `certbot-dns-cloudflare` for the DNS plugin.

### 1. Automatic certificates (Cloudflare DNS-01)

1. Create a Cloudflare API token with **Zone → DNS → Edit** on your zone.
2. Put secrets in a `.env` file next to `docker-compose.yml` (do not commit the token):

```bash
DOMAIN_NAME=domainpeek.xyz
CERTBOT_DOMAINS=www.domainpeek.xyz
CERTBOT_EMAIL=you@example.com
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
# Optional: CERTBOT_STAGING=1  # Let's Encrypt staging for dry runs
# Optional: CERTBOT_RENEW_INTERVAL_SECONDS=43200  # default 12h
```

3. Ensure `./ssl` exists (compose mounts it read-write for cert links):

```bash
mkdir -p ssl
docker compose --profile nginx up --build -d
```

On first boot the entrypoint issues the cert, symlinks it into `/etc/nginx/ssl`, and starts a renew loop (~every 12h) that reloads nginx after successful renewals. Let's Encrypt data persists in the `letsencrypt` Docker volume.

Required together for auto-issuance: `DOMAIN_NAME`, `CERTBOT_EMAIL`, `CLOUDFLARE_API_TOKEN`. `CERTBOT_DOMAINS` is an optional comma-separated SAN list.

### 2. Manual / self-signed certificates

If Certbot env vars are unset, nginx uses files already present under `./ssl`:

```bash
mkdir -p ssl
cp your-cert.pem ssl/cert.pem
cp your-key.pem ssl/key.pem

# Or generate self-signed (development only)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/key.pem -out ssl/cert.pem
```

Certificate paths in `docker/nginx/nginx.conf` are `/etc/nginx/ssl/cert.pem` and `/etc/nginx/ssl/key.pem`.

## Monitoring and Logging

### Health Checks

All services include health checks:

```bash
# Check health status
docker compose ps

# Detailed health info
curl http://localhost:4001/health
curl http://localhost:4000/api/health
```

### Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f frontend

# Follow new logs only
docker compose logs -f --tail=50
```

### Resource Monitoring

```bash
# Resource usage
docker stats

# Service-specific stats
docker stats domain-analyzer-frontend domain-analyzer-backend
```

## Troubleshooting

### Common Issues

1. **Port Conflicts**
   ```bash
   # Check port usage
   netstat -tlnp | grep :4000
   netstat -tlnp | grep :4001
   
   # Change ports in docker-compose.yml if needed
   ```

2. **Build Failures**
   ```bash
   # Clean build without cache
   DOCKER_BUILD_NO_CACHE=true docker compose build
   # or: docker compose build --no-cache
   
   # Remove all containers and rebuild
   docker compose down --volumes --remove-orphans
   docker compose up --build
   ```

3. **Service Dependencies**
   ```bash
   # Check service health
   docker compose exec backend curl http://localhost:4001/health
   docker compose exec frontend curl http://localhost:4000/api/health
   ```

4. **Nginx did not start**
   ```bash
   # Nginx is behind the "nginx" profile — enable it explicitly
   mkdir -p ssl
   docker compose --profile nginx up -d
   docker compose ps   # expect domain-analyzer-nginx
   ```

5. **UI shows Offline / API calls fail from a remote browser**
   - Backend may still be healthy on `:4001` while the UI calls `http://localhost:4001` inside the visitor's browser.
   - Re-run `./deploy.sh -p nginx -r` (or without nginx) so it rewrites `NEXT_PUBLIC_API_*` and rebuilds the frontend.
   - Override with `PUBLIC_API_URL=https://your.domain ./deploy.sh -p nginx -r` if auto-detect is wrong.
   - Prefer nginx (`--profile nginx`) so the site and `/api` share one public origin.

6. **API returns 401 Unauthorized**
   - `API_KEY` is set on the backend but the request lacks a matching API key (`X-API-Key` or `Authorization: Bearer`) + `X-Request-Nonce`.
   - Through nginx: ensure the same `API_KEY` is in root `.env`, rebuild/restart nginx (`./deploy.sh -p nginx -k -r`), and call the public `/api/` origin (not bare `:4001`). Nginx injects `X-API-Key`, `Authorization: Bearer`, and nonce.
   - Local without nginx: set matching `NEXT_PUBLIC_API_KEY` (frontend sends both key headers + nonce) or run `npm run generate:api-key -- --local`, or unset `API_KEY` to disable auth.
   - `/health` stays open on purpose (container healthchecks).

7. **Docker build hangs on `apk` / Alpine (bridge networking)**
   Host curl to Alpine can work while container egress on the Docker bridge fails (slow/`ECONNRESET` installs, `apk update` hung for minutes). On Linux hosts, set a lower Docker MTU and DNS, then restart Docker:

   ```bash
   mkdir -p /etc/docker
   cat >/etc/docker/daemon.json <<'EOF'
   {
     "dns": ["8.8.8.8", "1.1.1.1"],
     "mtu": 1400,
     "ipv6": false
   }
   EOF
   sysctl -w net.ipv4.ip_forward=1
   grep -q 'net.ipv4.ip_forward=1' /etc/sysctl.conf || echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
   systemctl restart docker

   # Quick verify (should finish in seconds)
   timeout 60 docker run --rm node:22-alpine sh -c 'apk update && apk add --no-cache libc6-compat && echo APK_OK'
   ```

8. **Network Issues**
   ```bash
   # Inspect the compose project network (name includes the project directory)
   docker network ls
   docker network inspect domain-intelligence-analyzer_default
   ```

### Performance Tuning

1. **Memory Limits**
   - Adjust `deploy.resources` in docker-compose.yml
   - Monitor with `docker stats`

2. **Build Optimization**
   - Use `.dockerignore` to exclude files
   - Leverage multi-stage builds
   - Use specific base image tags

3. **Caching**
   - Enable Redis with `-p redis` or `-p default` for API caching / rate-limit / snapshots
   - Configure Nginx caching for static assets

## Security Considerations

### Production Checklist

- [ ] Change default passwords
- [ ] Configure CORS origins properly
- [x] Enable rate limiting
- [ ] Set `API_KEY` in `.env` (shared by backend + nginx; injects `X-API-Key` + `Authorization: Bearer` + `X-Request-Nonce`) — or `./deploy.sh -p nginx -k` / `-K` to generate/rotate
- [ ] Use HTTPS with valid certificates
- [ ] Keep base images updated
- [ ] Run containers as non-root users
- [ ] Configure firewall rules
- [ ] Enable security headers in Nginx
- [ ] Prefer not exposing `:4001` publicly when nginx profile is used (API key still required on direct hits)

### Network Security

```bash
# Internal network isolation
# Services communicate via internal network
# Only expose necessary ports externally
```

## Backup and Maintenance

### Data Backup

```bash
# Backup Redis data
docker compose exec redis redis-cli BGSAVE

# Backup logs
docker compose logs > backup-logs-$(date +%Y%m%d).log
```

### Updates

```bash
# Pull latest images
docker compose pull

# Rebuild and restart with new images
docker compose up --build -d

# Clean old images
docker image prune -f
```

### Maintenance Commands

```bash
# Stop all services
docker compose down

# Stop and remove volumes
docker compose down --volumes

# Remove everything including networks
docker compose down --volumes --remove-orphans

# System cleanup
docker system prune -af
```

## Advanced Configuration

### Custom Nginx Configuration

1. Modify `docker/nginx/nginx.conf` for your needs
2. Restart nginx service:
   ```bash
   docker compose restart nginx
   ```

### Redis Configuration

Redis is opt-in via `-p redis` or `-p default` (`REDIS_URL=redis://redis:6379`). `./deploy.sh` autofills `REDIS_*`, `SNAPSHOT_TTL_SECONDS`, and `SHARE_TTL_SECONDS` when missing. Optional password: set `REDIS_PASSWORD` (backend merges into the URL) or use `REDIS_URL=redis://:password@redis:6379`.

API extras backed by Redis: `GET /api/history/:domain`, `GET /api/recent`, `POST /api/share`, `GET /api/share/:token`, Express rate-limit store, and `/health` Redis ping. Without the Redis profile the API still runs (memory cache / empty history / empty recent feed).

Ops (host or container only — not a public UI): list all analyses including private and cache status with `npm run list:analyzed` or `docker compose exec backend npm run list:analyzed`. Optional loopback HTTP: `INTERNAL_ANALYZED_LIST=1` → `GET /api/internal/analyzed`.

1. Add custom redis.conf
2. Mount in docker-compose.yml:
   ```yaml
   redis:
     command: ["redis-server", "/usr/local/etc/redis/redis.conf"]
     volumes:
       - ./redis.conf:/usr/local/etc/redis/redis.conf:ro
   ```

### Environment-specific Overrides

Create additional compose files:

```bash
# docker-compose.staging.yml
# docker-compose.production.yml

# Use with:
docker compose -f docker-compose.yml -f docker-compose.staging.yml up --build -d
```

## Support

For deployment issues:

1. Check this documentation
2. Review logs: `docker compose logs`
3. Verify configuration: `.env` file and docker-compose.yml
4. Test health endpoints
5. Check GitHub issues or create a new one

## Performance Benchmarks

Expected performance on recommended hardware:

- **Response Time**: < 2s for domain analysis
- **Throughput**: 50+ concurrent requests
- **Memory Usage**: ~1GB total
- **Build Time**: 5-10 minutes (cold build)
- **Startup Time**: 30-60 seconds (all services healthy)