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
# Build cache mode: auto | cache | nocache
#   auto    — no-cache only when cold build inputs change (lockfiles/Dockerfiles/…)
#   cache   — always use layer cache (-c / --cache)
#   nocache — always cold rebuild (-r / --rebuild / --no-cache)
CACHE_MODE="auto"
PULL=false
GENERATE_API_KEY=false
ROTATE_API_KEY=false

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
    cat <<'EOF'
DomainPeek - Docker Deployment Script

Usage: ./deploy.sh [OPTIONS]

OPTIONS:
    -e, --environment    Environment (production|development) [default: production]
    -p, --profile       Compose profile (repeatable or comma-separated):
                          nginx   — reverse proxy (+ TLS helpers)
                          redis   — Redis cache / rate-limit / snapshots / share
                          graph   — Memgraph relation graph (Bolt :7687)
                          default — nginx + redis + memgraph together
                        Examples: -p nginx  |  -p redis  |  -p graph  |  -p default
                                  -p nginx -p redis  |  -p nginx,redis
    -r, --rebuild, --no-cache
                        Force cold rebuild (DOCKER_BUILD_NO_CACHE=true)
    -c, --cache         Force layer cache even if cold inputs changed
                        Default without -r/-c: auto-detect (see BUILD CACHE)
    -u, --pull         Pull latest base images before building
                        (sets DOCKER_BUILD_PULL=true in compose)
    -k, --generate-api-key  Generate API_KEY if missing (root + backend .env)
    -K, --rotate-api-key    Force a new API_KEY (overwrites existing)
    -h, --help         Show this help message

ENVIRONMENT:
    PUBLIC_HOST         Optional override for the public IP in CORS_ORIGINS
                        and (without nginx) the browser API origin.
                        Default: first global IPv4 from `ip -4 addr` (ip a).
                        Always also merges domainpeek.xyz (http/https + www).
    PUBLIC_API_URL      Optional full override for NEXT_PUBLIC_API_* (browser
                        API origin baked into the frontend at build time).
                        Default: https://$DOMAIN_NAME with -p nginx|default, else
                        http://$PUBLIC_HOST:4001 (or http://localhost:4001).
    DOMAIN_NAME         Primary hostname for nginx Let's Encrypt (Cloudflare DNS-01).
                        Also used as the https:// origin for NEXT_PUBLIC_API_*.
    CERTBOT_EMAIL       Email for Let's Encrypt registration.
    CERTBOT_DOMAINS     Optional comma-separated SANs (e.g. www.domainpeek.xyz).
    CLOUDFLARE_API_TOKEN  Cloudflare API token (Zone DNS Edit). Required with
                        DOMAIN_NAME + CERTBOT_EMAIL for auto TLS.
    API_KEY             Shared secret for backend + nginx (X-API-Key + Bearer). Prefer
                        -k / -K or: npm run generate:api-key
    COMPOSE_PROFILES    Alternative to -p (e.g. COMPOSE_PROFILES=default)

BUILD CACHE (auto by default):
    Cold rebuild (no-cache) when these change vs .docker-build-fingerprint:
      Dockerfiles, package.json / package-lock.json, docker/nginx/*, compose files
    Cached rebuild (--build) for source edits and NEXT_PUBLIC_API_* changes
      (Docker invalidates layers from changed COPY/ARG onward)
    Overrides: -r/--no-cache  |  -c/--cache  |  DOCKER_BUILD_NO_CACHE=true

EXAMPLES:
    # Recommended (production): Nginx + Redis, API key, pull base images, auto cache
    ./deploy.sh -p default -k -u

    ./deploy.sh                                    # Core only (frontend + backend)
    ./deploy.sh -p redis                           # Core + Redis
    ./deploy.sh -p nginx                           # Core + Nginx
    ./deploy.sh -p default                         # Core + Nginx + Redis (no -k/-u)
    ./deploy.sh -p nginx -p redis                  # Same as -p default
    ./deploy.sh -e development                     # Development with hot reload
    ./deploy.sh -r                                 # Force no-cache rebuild
    ./deploy.sh -c                                 # Force cached rebuild
    ./deploy.sh -p default -K -r                   # Rotate API_KEY and cold rebuild

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

# Read KEY=value from .env (no export / no shell evaluation)
env_get() {
    local key="$1"
    if [ ! -f .env ]; then
        return 0
    fi
    grep -E "^${key}=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

# Set or replace KEY=value in .env
set_env_var() {
    local key="$1"
    local value="$2"
    local file="${3:-.env}"
    if [ ! -f "$file" ]; then
        printf '%s=%s\n' "$key" "$value" > "$file"
        return 0
    fi
    if grep -qE "^${key}=" "$file" 2>/dev/null; then
        sed -i "s|^${key}=.*|${key}=${value}|" "$file"
    elif grep -qE "^#\\s*${key}=" "$file" 2>/dev/null; then
        sed -i "s|^#\\s*${key}=.*|${key}=${value}|" "$file"
    else
        printf '\n%s=%s\n' "$key" "$value" >> "$file"
    fi
}

# Generate URL-safe API key (prefer node script; openssl fallback for minimal hosts)
generate_api_key_value() {
    if command -v node &> /dev/null && [ -f scripts/generate-api-key.mjs ]; then
        # Extract only the API_KEY= line from script output
        local out
        out="$(node scripts/generate-api-key.mjs --dry-run --print 2>/dev/null | grep -E '^API_KEY=' | head -1 | cut -d= -f2-)"
        if [ -n "$out" ]; then
            printf '%s' "$out"
            return 0
        fi
    fi
    if command -v openssl &> /dev/null; then
        openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n\r'
        return 0
    fi
    # Last resort
    head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n\r'
}

ensure_backend_env() {
    if [ ! -f apps/backend/.env ]; then
        if [ -f apps/backend/.env.example ]; then
            cp apps/backend/.env.example apps/backend/.env
            log "Created apps/backend/.env from .env.example"
        else
            touch apps/backend/.env
        fi
    fi
}

# Fill missing Redis defaults for the default Compose stack (never overwrite set values)
ensure_redis_env() {
    ensure_backend_env

    local filled=0
    ensure_redis_key() {
        local key="$1"
        local value="$2"
        local file="$3"
        local current=""
        if [ -f "$file" ]; then
            current="$(grep -E "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
        fi
        if [ -z "$current" ]; then
            set_env_var "$key" "$value" "$file"
            filled=1
        fi
    }

    # Root .env (docker compose)
    ensure_redis_key REDIS_URL "redis://redis:6379" .env
    ensure_redis_key REDIS_HOST "redis" .env
    ensure_redis_key REDIS_PORT "6379" .env
    ensure_redis_key REDIS_TTL_SECONDS "3600" .env
    ensure_redis_key SNAPSHOT_TTL_SECONDS "2592000" .env
    ensure_redis_key SHARE_TTL_SECONDS "604800" .env

    # Backend .env (same Docker defaults; local npm can override to localhost)
    ensure_redis_key REDIS_URL "redis://redis:6379" apps/backend/.env
    ensure_redis_key REDIS_HOST "redis" apps/backend/.env
    ensure_redis_key REDIS_PORT "6379" apps/backend/.env
    ensure_redis_key REDIS_TTL_SECONDS "3600" apps/backend/.env
    ensure_redis_key SNAPSHOT_TTL_SECONDS "2592000" apps/backend/.env
    ensure_redis_key SHARE_TTL_SECONDS "604800" apps/backend/.env

    if [ "$filled" -eq 1 ]; then
        log "Redis env defaults applied (REDIS_URL=redis://redis:6379)"
    fi
}

# -k: create API_KEY if missing; -K: always rotate. Writes root + backend .env
manage_api_key() {
    if [ "$GENERATE_API_KEY" != true ] && [ "$ROTATE_API_KEY" != true ]; then
        return 0
    fi

    ensure_backend_env

    # Prefer the standalone Node generator when available
    if command -v node &> /dev/null && [ -f scripts/generate-api-key.mjs ]; then
        local gen_args=()
        if [ "$ROTATE_API_KEY" = true ]; then
            gen_args+=(--force)
            log "Rotating API_KEY via scripts/generate-api-key.mjs"
        else
            log "Ensuring API_KEY via scripts/generate-api-key.mjs"
        fi
        if node scripts/generate-api-key.mjs "${gen_args[@]}"; then
            success "API_KEY ready (root + apps/backend/.env)"
            return 0
        fi
        warn "Node generator failed; falling back to shell generation"
    fi

    local existing
    existing="$(env_get API_KEY)"
    if [ "$ROTATE_API_KEY" != true ] && [ -n "$existing" ]; then
        log "API_KEY already set (use -K / --rotate-api-key to rotate)"
        # Keep backend in sync if root has a key but backend does not
        local backend_key
        backend_key="$(grep -E '^API_KEY=' apps/backend/.env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r')"
        if [ -z "$backend_key" ]; then
            set_env_var API_KEY "$existing" apps/backend/.env
            log "Synced API_KEY into apps/backend/.env"
        fi
        return 0
    fi

    local key
    key="$(generate_api_key_value)"
    if [ -z "$key" ]; then
        error "Failed to generate API_KEY"
    fi

    set_env_var API_KEY "$key" .env
    set_env_var API_KEY "$key" apps/backend/.env

    if [ "$ROTATE_API_KEY" = true ]; then
        success "API_KEY rotated"
    else
        success "API_KEY generated"
    fi
    log "API_KEY written to .env and apps/backend/.env (shared with nginx via compose)"
}

# Active profiles come from -p / COMPOSE_PROFILES (comma-separated).
active_profiles() {
    local combined="${PROFILE:-}"
    if [ -n "${COMPOSE_PROFILES:-}" ]; then
        if [ -n "$combined" ]; then
            combined="${combined},${COMPOSE_PROFILES}"
        else
            combined="${COMPOSE_PROFILES}"
        fi
    fi
    printf '%s' "$combined"
}

profile_enabled() {
    local needle="$1"
    local haystack
    haystack="$(active_profiles)"
    [[ ",${haystack}," == *",${needle},"* ]]
}

using_nginx_profile() {
    profile_enabled nginx || profile_enabled default
}

using_redis_profile() {
    profile_enabled redis || profile_enabled default
}

# Normalize PROFILE into COMPOSE_PROFILES (dedupe, trim).
resolve_compose_profiles() {
    local raw
    raw="$(active_profiles)"
    if [ -z "$raw" ]; then
        return 0
    fi

    local -a parts=()
    local -A seen=()
    local IFS=','
    local p
    for p in $raw; do
        p="$(printf '%s' "$p" | tr -d '[:space:]')"
        [ -z "$p" ] && continue
        if [ -z "${seen[$p]:-}" ]; then
            seen[$p]=1
            parts+=("$p")
        fi
    done

    if [ "${#parts[@]}" -gt 0 ]; then
        local IFS=','
        PROFILE="${parts[*]}"
        export COMPOSE_PROFILES="$PROFILE"
    fi
}

# Derive browser-facing API origin and write NEXT_PUBLIC_API_* into .env (build-time).
# Override anytime with PUBLIC_API_URL=https://example.com ./deploy.sh ...
ensure_public_api_urls() {
    local api_url=""
    local domain=""
    local host=""

    if [ -n "${PUBLIC_API_URL:-}" ]; then
        api_url="${PUBLIC_API_URL%/}"
    elif using_nginx_profile; then
        domain="$(env_get DOMAIN_NAME)"
        if [ -z "$domain" ]; then
            domain="${DOMAIN_NAME:-domainpeek.xyz}"
        fi
        api_url="https://${domain}"
    else
        host="$(detect_public_host)"
        if [ -n "$host" ] && [ "$host" != "127.0.0.1" ] && [ "$host" != "::1" ]; then
            api_url="http://${host}:4001"
        else
            api_url="http://localhost:4001"
        fi
    fi

    set_env_var NEXT_PUBLIC_API_BASE_URL "$api_url"
    set_env_var NEXT_PUBLIC_API_URL "$api_url"
    export NEXT_PUBLIC_API_BASE_URL="$api_url"
    export NEXT_PUBLIC_API_URL="$api_url"

    log "NEXT_PUBLIC_API_BASE_URL / NEXT_PUBLIC_API_URL → ${api_url}"
    log "(override with PUBLIC_API_URL=...; rebuild required after change)"
}

# Ensure .env CORS_ORIGINS includes public host, DOMAIN_NAME/SANs, domainpeek.xyz, localhost
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

    # Merge DOMAIN_NAME and CERTBOT_DOMAINS (SANs) as https/http origins
    local domain_list=()
    local dn
    dn="$(env_get DOMAIN_NAME)"
    dn="${DOMAIN_NAME:-$dn}"
    if [ -n "$dn" ]; then
        domain_list+=("$dn")
    fi
    local sans
    sans="$(env_get CERTBOT_DOMAINS)"
    sans="${CERTBOT_DOMAINS:-$sans}"
    if [ -n "$sans" ]; then
        local san
        IFS=',' read -ra _san_arr <<< "$sans"
        for san in "${_san_arr[@]}"; do
            san="$(echo "$san" | tr -d '[:space:]')"
            [ -n "$san" ] && domain_list+=("$san")
        done
    fi

    local d
    for d in "${domain_list[@]}"; do
        required+=(
            "https://${d}"
            "http://${d}"
        )
    done

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
        log "CORS_ORIGINS includes ${host} + DOMAIN_NAME/SANs + domainpeek.xyz"
    else
        log "CORS_ORIGINS includes DOMAIN_NAME/SANs + domainpeek.xyz + localhost"
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

    manage_api_key

    ensure_redis_env
    ensure_cors_origins
    ensure_public_api_urls

    # Nginx profile mounts ./ssl — create empty dir so compose does not fail
    if using_nginx_profile; then
        mkdir -p ssl
        if [ -z "$(env_get API_KEY)" ]; then
            warn "nginx profile enabled but API_KEY is empty — run with -k to generate, or set API_KEY in .env"
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

FINGERPRINT_FILE=".docker-build-fingerprint"

# Hash file contents (or a string). Empty input → "empty".
hash_payload() {
    if command -v sha256sum &> /dev/null; then
        sha256sum | awk '{print $1}'
    elif command -v shasum &> /dev/null; then
        shasum -a 256 | awk '{print $1}'
    else
        # Portable weak fallback
        cksum | awk '{print $1"-"$2}'
    fi
}

hash_files() {
    local existing=()
    local f
    for f in "$@"; do
        [ -f "$f" ] && existing+=("$f")
    done
    if [ ${#existing[@]} -eq 0 ]; then
        printf 'none'
        return
    fi
    # Path + content so renames/moves also change the digest
    {
        local p
        for p in "${existing[@]}"; do
            printf '%s\0' "$p"
            cat "$p"
            printf '\0'
        done
    } | hash_payload
}

# Inputs that warrant a cold rebuild (deps / image recipe).
# Source-only edits use Docker layer cache via `docker compose up --build`.
cold_build_files() {
    local files=(
        apps/backend/package.json
        apps/backend/package-lock.json
        apps/backend/Dockerfile
        apps/frontend/package.json
        apps/frontend/package-lock.json
        apps/frontend/Dockerfile
        docker/nginx/Dockerfile
        docker/nginx/docker-entrypoint.sh
        docker-compose.yml
        docker-compose.dev.yml
        docker-compose.override.yml
        package.json
        package-lock.json
    )
    local f
    for f in "${files[@]}"; do
        [ -f "$f" ] && printf '%s\n' "$f"
    done
}

cold_build_fingerprint() {
    local -a files=()
    local line
    while IFS= read -r line; do
        [ -n "$line" ] && files+=("$line")
    done < <(cold_build_files)
    if [ ${#files[@]} -eq 0 ]; then
        printf 'none'
        return
    fi
    hash_files "${files[@]}"
}

# Soft inputs: ARG / profile / env changes → cached rebuild is enough.
soft_build_fingerprint() {
    {
        printf 'ENV=%s\n' "${ENVIRONMENT:-production}"
        printf 'PROFILES=%s\n' "$(active_profiles)"
        printf 'NEXT_PUBLIC_API_BASE_URL=%s\n' "$(env_get NEXT_PUBLIC_API_BASE_URL)"
        printf 'NEXT_PUBLIC_API_URL=%s\n' "$(env_get NEXT_PUBLIC_API_URL)"
        printf 'DOMAIN_NAME=%s\n' "$(env_get DOMAIN_NAME)"
        # nginx.conf is mounted at runtime; still track it for status clarity
        if [ -f docker/nginx/nginx.conf ]; then
            printf 'docker/nginx/nginx.conf='
            hash_files docker/nginx/nginx.conf
            printf '\n'
        fi
    } | hash_payload
}

read_fingerprint_field() {
    local key="$1"
    local file="${2:-$FINGERPRINT_FILE}"
    if [ ! -f "$file" ]; then
        return 0
    fi
    # Support legacy single-hash files (treated as cold=)
    if ! grep -q '=' "$file" 2>/dev/null; then
        if [ "$key" = "cold" ]; then
            tr -d '[:space:]' < "$file"
        fi
        return 0
    fi
    grep -E "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '[:space:]'
}

# Decide DOCKER_BUILD_NO_CACHE from CACHE_MODE + fingerprints.
configure_build_cache() {
    local cold_now soft_now cold_prev soft_prev
    cold_now="$(cold_build_fingerprint)"
    soft_now="$(soft_build_fingerprint)"
    cold_prev="$(read_fingerprint_field cold)"
    soft_prev="$(read_fingerprint_field soft)"

    local reason=""
    local use_nocache=false

    case "$CACHE_MODE" in
        nocache)
            use_nocache=true
            reason="forced by -r/--no-cache"
            ;;
        cache)
            use_nocache=false
            reason="forced by -c/--cache"
            ;;
        auto|*)
            if [ -n "${DOCKER_BUILD_NO_CACHE:-}" ] && [ "${DOCKER_BUILD_NO_CACHE}" = "true" ]; then
                use_nocache=true
                reason="DOCKER_BUILD_NO_CACHE=true in environment"
            elif [ -z "$cold_prev" ]; then
                use_nocache=false
                reason="no prior fingerprint — using layer cache (pass -r for a cold build)"
            elif [ "$cold_now" != "$cold_prev" ]; then
                use_nocache=true
                reason="cold inputs changed (Dockerfile/lockfile/compose/nginx image)"
            else
                use_nocache=false
                if [ -n "$soft_prev" ] && [ "$soft_now" != "$soft_prev" ]; then
                    reason="build args/profiles changed — cached rebuild (Docker invalidates ARG/COPY layers)"
                else
                    reason="cold inputs unchanged — using layer cache"
                fi
            fi
            ;;
    esac

    if [ "$use_nocache" = true ]; then
        export DOCKER_BUILD_NO_CACHE=true
        log "Build cache: NO-CACHE ($reason)"
    else
        export DOCKER_BUILD_NO_CACHE=false
        log "Build cache: CACHE ($reason)"
    fi

    if [ "$PULL" = true ]; then
        export DOCKER_BUILD_PULL=true
        log "Pulling latest base images: DOCKER_BUILD_PULL=true"
    else
        export DOCKER_BUILD_PULL="${DOCKER_BUILD_PULL:-false}"
    fi

    BUILD_INPUT_FINGERPRINT_COLD="$cold_now"
    BUILD_INPUT_FINGERPRINT_SOFT="$soft_now"
}

save_build_fingerprint() {
    if [ -n "${BUILD_INPUT_FINGERPRINT_COLD:-}" ]; then
        {
            printf 'cold=%s\n' "$BUILD_INPUT_FINGERPRINT_COLD"
            printf 'soft=%s\n' "${BUILD_INPUT_FINGERPRINT_SOFT:-}"
            printf 'saved_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date)"
        } > "$FINGERPRINT_FILE"
    fi
}

build_images() {
    log "Building Docker images..."

    configure_build_cache

    # Compose file selection
    COMPOSE_FILES="-f docker-compose.yml"
    
    if [ "$ENVIRONMENT" = "development" ]; then
        COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.dev.yml"
        log "Using development configuration"
    fi
    
    resolve_compose_profiles
    if [ -n "${COMPOSE_PROFILES:-}" ]; then
        log "Using profiles: $COMPOSE_PROFILES"
    else
        log "Using core stack (no optional profiles)"
    fi

    # no_cache / pull come from docker-compose.yml via DOCKER_BUILD_* env
    docker compose $COMPOSE_FILES build

    save_build_fingerprint
    success "Images built successfully"
}

deploy_services() {
    log "Deploying services..."
    
    COMPOSE_FILES="-f docker-compose.yml"
    
    if [ "$ENVIRONMENT" = "development" ]; then
        COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.dev.yml"
    fi
    
    resolve_compose_profiles

    # Images were just built; avoid a second cached rebuild that would undo --no-cache.
    # Still pass --build when cache is allowed so plain code changes are picked up.
    if [ "${DOCKER_BUILD_NO_CACHE:-false}" = "true" ]; then
        docker compose $COMPOSE_FILES up -d
    else
        docker compose $COMPOSE_FILES up --build -d
    fi
    
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
    
    local public_api="${NEXT_PUBLIC_API_BASE_URL:-$(env_get NEXT_PUBLIC_API_BASE_URL)}"
    public_api="${public_api:-http://localhost:4001}"

    echo ""
    log "Access URLs:"
    if using_nginx_profile; then
        echo "  Public site:  ${public_api}"
        echo "  Nginx:        http://localhost:80 / https://localhost:443"
        echo "  Browser API:  ${public_api}  (inlined into frontend build; /api + /socket.io)"
        echo "  Direct FE:    http://localhost:4000  (bypass nginx)"
        echo "  Direct API:   http://localhost:4001  (bypass nginx)"
    else
        echo "  Frontend:     http://localhost:4000"
        echo "  Backend API:  http://localhost:4001"
        echo "  API Docs:     http://localhost:4001/docs"
        echo "  Browser API:  ${public_api}  (inlined into frontend build)"
    fi

    if using_redis_profile; then
        echo "  Redis:        localhost:6379  (profile: redis|default)"
    else
        echo "  Redis:        (not started — use -p redis or -p default)"
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
            if [ -z "${2:-}" ]; then
                error "Option $1 requires a value (nginx|redis|default)"
            fi
            if [ -n "${PROFILE:-}" ]; then
                PROFILE="${PROFILE},$2"
            else
                PROFILE="$2"
            fi
            shift 2
            ;;
        -r|--rebuild|--no-cache)
            CACHE_MODE="nocache"
            shift
            ;;
        -c|--cache)
            CACHE_MODE="cache"
            shift
            ;;
        -u|--pull)
            PULL=true
            shift
            ;;
        -k|--generate-api-key)
            GENERATE_API_KEY=true
            shift
            ;;
        -K|--rotate-api-key)
            ROTATE_API_KEY=true
            GENERATE_API_KEY=true
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