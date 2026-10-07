# Docker Deployment Guide

This document provides comprehensive instructions for deploying DomainPeek using Docker and Docker Compose.

## Prerequisites

- Docker Engine 20.10+ with the Compose V2 plugin (`docker compose`)
- Node.js 22 LTS (container base image: `node:22-alpine`)
- At least 2GB RAM available for containers
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

# Copy environment template
cp .env.example .env
# Edit .env with your configuration
```

### 2. Production Deployment

```bash
# Recommended: automated deploy (installs Docker if needed)
./deploy.sh

# Or manage Compose directly
docker compose up --build -d

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
# For local Docker without nginx, use the host-published backend port:
NEXT_PUBLIC_API_BASE_URL=http://localhost:4001
# Legacy alias used by some server routes / next.config — keep in sync:
NEXT_PUBLIC_API_URL=http://localhost:4001

# Backend
PORT=4001
LOG_LEVEL=info

# Security — include every origin users will open in a browser
# ./deploy.sh auto-merges localhost, domainpeek.xyz (http/https + www), http://<ip-from-ip-a>[:4000]
# Optional override: PUBLIC_HOST=<ip> ./deploy.sh
CORS_ORIGINS=http://localhost:4000,http://frontend:4000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Optional: Redis caching
# REDIS_URL=redis://redis:6379
# REDIS_PASSWORD=your_password

# Optional: enable compose profiles without CLI flags
# COMPOSE_PROFILES=redis,nginx
```

**Public VPS / remote browser access:** set both `NEXT_PUBLIC_*` values to a URL the **browser** can reach (for example `http://YOUR_PUBLIC_IP:4001`, or `http://YOUR_PUBLIC_IP` when nginx is on port 80). Do **not** use `http://backend:4001` for those variables — that hostname only resolves inside the Docker network. `NEXT_PUBLIC_*` values must be present at **image build** time; changing them in a running container alone has no effect. Rebuild the frontend after updating them.

`./deploy.sh` merges `CORS_ORIGINS` automatically: `http://localhost:4000`, `http(s)://domainpeek.xyz`, `http(s)://www.domainpeek.xyz`, plus `http://<first-global-ipv4>` and `http://<first-global-ipv4>:4000` from `ip -4 addr` (`ip a`). Existing origins are kept. Override the detected IP with `PUBLIC_HOST=<ip>` only when needed.

### Service Profiles

Nginx and Redis are **opt-in**. A plain `docker compose up --build` starts only `frontend` and `backend`.

```bash
# Enable Redis caching
docker compose --profile redis up --build -d

# Enable Nginx reverse proxy (create ./ssl first — compose mounts it)
mkdir -p ssl
docker compose --profile nginx up --build -d

# Enable both
docker compose --profile redis --profile nginx up --build -d

# Or via deploy.sh
./deploy.sh --profile redis,nginx
```

With the `nginx` profile, open the app on port **80** (`http://YOUR_HOST/`). Ports 4000/4001 remain available for direct access unless you close them in the firewall.

## Service Architecture

### Core Services

1. **Backend** (`backend`)
   - Node.js API server
   - Port: 4001
   - Health check: `/health`
   - Warms IANA RDAP bootstrap + WHOIS TLD list on startup

2. **Frontend** (`frontend`) 
   - Next.js web application
   - Port: 4000
   - Health check: `/api/health`

### Optional Services

3. **Redis** (`redis`)
   - In-memory caching
   - Port: 6379
   - Profile: `redis`

4. **Nginx** (`nginx`)
   - Reverse proxy (`/` → frontend, `/api/` and `/health` → backend)
   - Ports: 80, 443
   - Profile: `nginx` (not started unless enabled)
   - Requires `./ssl` directory (empty is fine until you add TLS certs)

## Docker Images

### Multi-stage Build

Both frontend and backend use multi-stage builds based on `node:22-alpine`:

- `deps` - Production dependencies
- `dev` - Development environment
- `builder` - Build stage
- `runner` - Production runtime

After dependency or security bumps (for example Next.js 15.5.27 / Express 4.22.x patches in the lockfile), rebuild without cache so images pick up the new `package-lock.json`:

```bash
docker compose build --no-cache
docker compose up -d
```

### Image Sizes (Approximate)

- Backend: ~150MB
- Frontend: ~130MB  
- Redis: ~40MB
- Nginx: ~25MB

## Deployment Scenarios

### 1. Local Development

```bash
# Hot reloading with volume mounts
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Access:
# - Frontend: http://localhost:4000  
# - Backend API: http://localhost:4001
# - API Docs: http://localhost:4001/docs
```

### 2. Production (Basic)

```bash
# Production build with health checks
docker compose up --build -d

# Access:
# - Application: http://localhost:4000
# - API: http://localhost:4001
```

### 3. Production with Redis

```bash
# Enable Redis for caching
export COMPOSE_PROFILES=redis
docker compose up --build -d

# Redis available at localhost:6379
```

### 4. Production with Nginx

```bash
# Full stack with reverse proxy
export COMPOSE_PROFILES=redis,nginx
docker compose up --build -d

# Access:
# - Application: http://localhost (port 80)
# - SSL: https://localhost (port 443, requires SSL setup)
```

## SSL/HTTPS Setup

### 1. Certificate Preparation

```bash
# Create SSL directory
mkdir ssl

# Place your certificates
cp your-cert.pem ssl/cert.pem
cp your-key.pem ssl/key.pem

# Or generate self-signed (development only)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/key.pem -out ssl/cert.pem
```

### 2. Enable HTTPS in nginx.conf

Uncomment the HTTPS server block in `nginx.conf` and update:
- Server name
- SSL certificate paths
- Add location blocks

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
   docker compose build --no-cache
   
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
   - Set `NEXT_PUBLIC_API_BASE_URL` (and `NEXT_PUBLIC_API_URL`) to the public API origin and rebuild the frontend.
   - Run `./deploy.sh` so `CORS_ORIGINS` picks up the host IP (`ip a`) and domainpeek.xyz.
   - Prefer nginx (`--profile nginx`) so the site is served on port 80 and API paths share that origin.

6. **Docker build hangs on `apk` / Alpine (bridge networking)**
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

7. **Network Issues**
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
   - Enable Redis profile for API caching
   - Configure Nginx caching for static assets

## Security Considerations

### Production Checklist

- [ ] Change default passwords
- [ ] Configure CORS origins properly
- [ ] Enable rate limiting
- [ ] Use HTTPS with valid certificates
- [ ] Keep base images updated
- [ ] Run containers as non-root users
- [ ] Configure firewall rules
- [ ] Enable security headers in Nginx

### Network Security

```bash
# Internal network isolation
# Services communicate via internal network
# Only expose necessary ports externally
```

## Backup and Maintenance

### Data Backup

```bash
# Backup Redis data (if using)
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

1. Modify `nginx.conf` for your needs
2. Restart nginx service:
   ```bash
   docker compose restart nginx
   ```

### Redis Configuration

1. Add custom redis.conf
2. Mount in docker-compose.yml:
   ```yaml
   redis:
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