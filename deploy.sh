#!/bin/bash

# Domain Intelligence Analyzer - Docker Deployment Script
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
Domain Intelligence Analyzer - Docker Deployment Script

Usage: ./deploy.sh [OPTIONS]

OPTIONS:
    -e, --environment    Environment (production|development) [default: production]
    -p, --profile       Docker compose profile (redis,nginx)
    -r, --rebuild       Force rebuild images without cache
    -u, --pull         Pull latest base images before building
    -h, --help         Show this help message

EXAMPLES:
    ./deploy.sh                                    # Basic production deployment
    ./deploy.sh -e development                     # Development with hot reload
    ./deploy.sh -p redis                          # Production with Redis
    ./deploy.sh -p redis,nginx                    # Full stack with reverse proxy
    ./deploy.sh -e development -r                 # Development with rebuild
    ./deploy.sh -p nginx -u                       # Production with nginx, pull latest

EOF
}

check_dependencies() {
    log "Checking dependencies..."
    
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed or not in PATH"
    fi
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        error "Docker Compose is not installed"
    fi
    
    # Check Docker daemon
    if ! docker info &> /dev/null; then
        error "Docker daemon is not running"
    fi
    
    success "Dependencies check passed"
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
    
    # Build command
    if command -v docker-compose &> /dev/null; then
        docker-compose $COMPOSE_FILES build $BUILD_ARGS
    else
        docker compose $COMPOSE_FILES build $BUILD_ARGS
    fi
    
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
    
    # Deploy command
    if command -v docker-compose &> /dev/null; then
        docker-compose $COMPOSE_FILES up -d
    else
        docker compose $COMPOSE_FILES up -d
    fi
    
    success "Services deployed successfully"
}

wait_for_health() {
    log "Waiting for services to be healthy..."
    
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -f http://localhost:3001/health &> /dev/null && curl -f http://localhost:3000/api/health &> /dev/null; then
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
    
    if command -v docker-compose &> /dev/null; then
        docker-compose ps
    else
        docker compose ps
    fi
    
    echo ""
    log "Access URLs:"
    echo "  Frontend:     http://localhost:3000"
    echo "  Backend API:  http://localhost:3001"
    echo "  API Docs:     http://localhost:3001/docs"
    
    if [[ "$PROFILE" == *"redis"* ]]; then
        echo "  Redis:        localhost:6379"
    fi
    
    if [[ "$PROFILE" == *"nginx"* ]]; then
        echo "  Nginx:        http://localhost:80"
    fi
}

cleanup_on_exit() {
    if [ $? -ne 0 ]; then
        error "Deployment failed. Check logs with: docker-compose logs"
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

log "Starting Docker deployment for Domain Intelligence Analyzer"
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
success "Your Domain Intelligence Analyzer is now running."