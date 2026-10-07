#!/bin/bash

# DomainPeek - Docker Deployment Script
# This script automates the build and deployment process

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="production"
PROFILE=""
REBUILD=false
PULL=false

# Preserve original args for re-exec after docker group activation
SCRIPT_ARGS=("$@")

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Functions
log() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

show_help() {
    cat << EOF
DomainPeek - Docker Deployment Script

Usage: ./deploy.sh [OPTIONS]

OPTIONS:
    -e, --environment    Environment (production|development) [default: production]
    -p, --profile       Docker compose profile (redis,nginx)
    -r, --rebuild       Force rebuild images without cache
    -u, --pull         Pull latest base images before building
    -h, --help         Show this help message

ENVIRONMENT:
    PUBLIC_HOST         Optional override for the public IP in CORS_ORIGINS.
                        Default: first global IPv4 from `ip -4 addr` (ip a).
                        Always also merges domainpeek.xyz (http/https + www).

EXAMPLES:
    ./deploy.sh                                    # Basic production deployment
    ./deploy.sh -e development                     # Development with hot reload
    ./deploy.sh -p redis                          # Production with Redis
    ./deploy.sh -p redis,nginx                    # Full stack with reverse proxy
    ./deploy.sh -e development -r                 # Development with rebuild
    ./deploy.sh -p nginx -u                       # Production with nginx, pull latest

EOF
}

install_docker() {
    log "Docker is not installed. Installing via get.docker.com..."
    local installer
    installer="$(mktemp)"
    curl -fsSL https://get.docker.com -o "$installer"
    sudo sh "$installer"
    rm -f "$installer"
    success "Docker installed"
}

ensure_docker_group() {
    local current_user="${SUDO_USER:-$USER}"

    if id -nG "$current_user" | grep -qw docker; then
        return 0
    fi

    log "Adding $current_user to the docker group (so Docker can run without sudo)..."
    sudo usermod -aG docker "$current_user"
    success "User $current_user added to the docker group"
}

check_dependencies() {
    log "Checking dependencies..."

    if ! command -v docker &> /dev/null; then
        install_docker
    fi

    ensure_docker_group

    # Start daemon if installed but not running
    if ! docker info &> /dev/null && ! sudo docker info &> /dev/null; then
        if command -v systemctl &> /dev/null; then
            log "Starting Docker daemon..."
            sudo systemctl enable --now docker || true
        fi
    fi

    # Group membership only applies to new sessions; re-exec under docker group if needed
    if ! docker info &> /dev/null && sudo docker info &> /dev/null; then
        if [ -z "${DOCKER_GROUP_ACTIVATED:-}" ] \
            && id -nG "${SUDO_USER:-$USER}" | grep -qw docker \
            && command -v sg &> /dev/null; then
            warn "Activating docker group for this session..."
            local relaunch
            printf -v relaunch '%q ' "env" "DOCKER_GROUP_ACTIVATED=1" "$SCRIPT_DIR/deploy.sh" "${SCRIPT_ARGS[@]}"
            exec sg docker -c "$relaunch"
        fi
        error "Docker is installed but this shell cannot access it yet. Log out and back in (or run: newgrp docker), then re-run ./deploy.sh"
    fi

    if ! docker compose version &> /dev/null; then
        error "Docker Compose V2 is not installed (requires the docker compose plugin)"
    fi

    if ! docker info &> /dev/null; then
        error "Docker daemon is not running"
    fi

    success "Dependencies check passed"
}

detect_public_host() {
    # Optional override only — default is local interface IP from `ip a`
    if [ -n "${PUBLIC_HOST:-}" ]; then
        printf '%s' "$PUBLIC_HOST"
        return 0
    fi

    local ip=""
    if command -v ip >/dev/null 2>&1; then
        # Prefer first global-scope IPv4 (same idea as `ip a` / `ip -4 addr`)
        ip="$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -1)"
        if [ -z "$ip" ]; then
            ip="$(ip -4 addr show 2>/dev/null | awk '/inet / && $2 !~ /^127\./ { print $2; exit }' | cut -d/ -f1)"
        fi
        if [ -z "$ip" ]; then
            ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit }}')"
        fi
    fi
    if [ -z "$ip" ]; then
        ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
    fi

    printf '%s' "$ip"
}

# Ensure .env CORS_ORIGINS includes public host, domainpeek.xyz, localhost (merge, do not wipe extras)
ensure_cors_origins() {
    local host
    host="$(detect_public_host)"

    local required=(
        "http://localhost:4000"
        "http://domainpeek.xyz"
        "https://domainpeek.xyz"
        "http://www.domainpeek.xyz"
        "https://www.domainpeek.xyz"
    )

    if [ -n "$host" ]; then
        required+=(
            "http://${host}"
            "http://${host}:4000"
        )
    else
        warn "Could not detect public host; set PUBLIC_HOST=... to include IP origins in CORS_ORIGINS"
    fi

    local current=""
    if grep -q '^CORS_ORIGINS=' .env 2>/dev/null; then
        current="$(grep '^CORS_ORIGINS=' .env | head -1 | cut -d= -f2- | tr -d '\r')"
    fi

    local merged="$current"
    local origin
    for origin in "${required[@]}"; do
        case ",${merged}," in
            *",${origin},"*) ;;
            *)
                if [ -n "$merged" ]; then
                    merged="${merged},${origin}"
                else
                    merged="${origin}"
                fi
                ;;
        esac
    done

    if grep -q '^CORS_ORIGINS=' .env 2>/dev/null; then
        # Linux sed; deploy.sh targets Linux hosts
        sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=${merged}|" .env
    else
        printf '\nCORS_ORIGINS=%s\n' "$merged" >> .env
    fi

    if [ -n "$host" ]; then
        log "CORS_ORIGINS includes ${host} + domainpeek.xyz (override IP with PUBLIC_HOST=...)"
    else
        log "CORS_ORIGINS includes domainpeek.xyz + localhost"
    fi
}

setup_environment() {
    log "Setting up environment..."
    
    # Create .env if it doesn't exist
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example .env
            warn "Created .env from .env.example template"
            warn "Please review and update .env file before deployment"
        else
            error ".env.example template not found"
        fi
    fi

    ensure_cors_origins

    # Nginx profile mounts ./ssl — create empty dir so compose does not fail
    if [[ "${PROFILE}" == *"nginx"* ]] || [[ "${COMPOSE_PROFILES:-}" == *"nginx"* ]]; then
        mkdir -p ssl
    fi
    
    # Verify required environment variables
    if [ "$ENVIRONMENT" = "production" ]; then
        if ! grep -q "NODE_ENV=production" .env; then
            warn "NODE_ENV is not set to production in .env"
        fi
    fi
    
    success "Environment setup completed"
}

build_images() {
    log "Building Docker images..."
    
    BUILD_ARGS=""
    
    if [ "$REBUILD" = true ]; then
        BUILD_ARGS="$BUILD_ARGS --no-cache"
        log "Forcing rebuild without cache"
    fi
    
    if [ "$PULL" = true ]; then
        BUILD_ARGS="$BUILD_ARGS --pull"
        log "Pulling latest base images"
    fi
    
    # Compose file selection
    COMPOSE_FILES="-f docker-compose.yml"
    
    if [ "$ENVIRONMENT" = "development" ]; then
        COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.dev.yml"
        log "Using development configuration"
    fi
    
    # Set profiles
    if [ -n "$PROFILE" ]; then
        export COMPOSE_PROFILES="$PROFILE"
        log "Using profiles: $PROFILE"
    fi
    
    docker compose $COMPOSE_FILES build $BUILD_ARGS
    
    success "Images built successfully"
}

deploy_services() {
    log "Deploying services..."
    
    COMPOSE_FILES="-f docker-compose.yml"
    
    if [ "$ENVIRONMENT" = "development" ]; then
        COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.dev.yml"
    fi
    
    if [ -n "$PROFILE" ]; then
        export COMPOSE_PROFILES="$PROFILE"
    fi
    
    docker compose $COMPOSE_FILES up --build -d
    
    success "Services deployed successfully"
}

wait_for_health() {
    log "Waiting for services to be healthy..."
    
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -f http://localhost:4001/health &> /dev/null && curl -f http://localhost:4000/api/health &> /dev/null; then
            success "All services are healthy"
            return 0
        fi
        
        attempt=$((attempt + 1))
        log "Health check attempt $attempt/$max_attempts..."
        sleep 2
    done
    
    error "Services failed to become healthy within timeout"
}

show_status() {
    log "Deployment status:"
    
    docker compose ps
    
    echo ""
    log "Access URLs:"
    echo "  Frontend:     http://localhost:4000"
    echo "  Backend API:  http://localhost:4001"
    echo "  API Docs:     http://localhost:4001/docs"
    
    if [[ "$PROFILE" == *"redis"* ]]; then
        echo "  Redis:        localhost:6379"
    fi
    
    if [[ "$PROFILE" == *"nginx"* ]]; then
        echo "  Nginx:        http://localhost:80"
    fi
}

cleanup_on_exit() {
    if [ $? -ne 0 ]; then
        error "Deployment failed. Check logs with: docker compose logs"
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -p|--profile)
            PROFILE="$2"
            shift 2
            ;;
        -r|--rebuild)
            REBUILD=true
            shift
            ;;
        -u|--pull)
            PULL=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            ;;
    esac
done

# Validate environment
if [ "$ENVIRONMENT" != "production" ] && [ "$ENVIRONMENT" != "development" ]; then
    error "Environment must be 'production' or 'development'"
fi

# Main execution
trap cleanup_on_exit EXIT

log "Starting Docker deployment for DomainPeek"
log "Environment: $ENVIRONMENT"

if [ -n "$PROFILE" ]; then
    log "Profiles: $PROFILE"
fi

check_dependencies
setup_environment
build_images
deploy_services
wait_for_health
show_status

success "Deployment completed successfully!"
success "Your DomainPeek is now running."