# Docker Deployment Guide

This document provides comprehensive instructions for deploying DomainPeek using Docker and Docker Compose.

## Prerequisites

- Docker Engine 20.10+ and Docker Compose 2.0+
- At least 2GB RAM available for containers
- 5GB disk space for images and data

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
# Build and start services
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f
```

### 3. Development Deployment

```bash
# Start with development overrides
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Follow logs
docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f
```

## Configuration

### Environment Variables

Key environment variables in `.env`:

```bash
# Application
NODE_ENV=production
NEXT_PUBLIC_API_URL=http://localhost:4001

# Backend
PORT=4001
LOG_LEVEL=info

# Security
CORS_ORIGINS=http://localhost:4000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Optional: Redis caching
# REDIS_URL=redis://redis:6379
# REDIS_PASSWORD=your_password
```

### Service Profiles

Enable optional services using Docker Compose profiles:

```bash
# Enable Redis caching
docker-compose --profile redis up -d

# Enable Nginx reverse proxy
docker-compose --profile nginx up -d

# Enable both
docker-compose --profile redis --profile nginx up -d
```

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
   - Reverse proxy and load balancer
   - Ports: 80, 443
   - Profile: `nginx`

## Docker Images

### Multi-stage Build

Both frontend and backend use multi-stage builds:

- `deps` - Production dependencies
- `dev` - Development environment
- `builder` - Build stage
- `runner` - Production runtime

### Image Sizes (Approximate)

- Backend: ~150MB
- Frontend: ~130MB  
- Redis: ~40MB
- Nginx: ~25MB

## Deployment Scenarios

### 1. Local Development

```bash
# Hot reloading with volume mounts
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# Access:
# - Frontend: http://localhost:4000  
# - Backend API: http://localhost:4001
# - API Docs: http://localhost:4001/docs
```

### 2. Production (Basic)

```bash
# Production build with health checks
docker-compose up -d

# Access:
# - Application: http://localhost:4000
# - API: http://localhost:4001
```

### 3. Production with Redis

```bash
# Enable Redis for caching
export COMPOSE_PROFILES=redis
docker-compose up -d

# Redis available at localhost:6379
```

### 4. Production with Nginx

```bash
# Full stack with reverse proxy
export COMPOSE_PROFILES=redis,nginx
docker-compose up -d

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
docker-compose ps

# Detailed health info
curl http://localhost:4001/health
curl http://localhost:4000/api/health
```

### Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend

# Follow new logs only
docker-compose logs -f --tail=50
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
   docker-compose build --no-cache
   
   # Remove all containers and rebuild
   docker-compose down --volumes --remove-orphans
   docker-compose up --build
   ```

3. **Service Dependencies**
   ```bash
   # Check service health
   docker-compose exec backend curl http://localhost:4001/health
   docker-compose exec frontend curl http://localhost:4000/api/health
   ```

4. **Network Issues**
   ```bash
   # Inspect network
   docker network ls
   docker network inspect domain-analyzer-network
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
docker-compose exec redis redis-cli BGSAVE

# Backup logs
docker-compose logs > backup-logs-$(date +%Y%m%d).log
```

### Updates

```bash
# Pull latest images
docker-compose pull

# Restart with new images
docker-compose up -d

# Clean old images
docker image prune -f
```

### Maintenance Commands

```bash
# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down --volumes

# Remove everything including networks
docker-compose down --volumes --remove-orphans

# System cleanup
docker system prune -af
```

## Advanced Configuration

### Custom Nginx Configuration

1. Modify `nginx.conf` for your needs
2. Restart nginx service:
   ```bash
   docker-compose restart nginx
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
docker-compose -f docker-compose.yml -f docker-compose.staging.yml up -d
```

## Support

For deployment issues:

1. Check this documentation
2. Review logs: `docker-compose logs`
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