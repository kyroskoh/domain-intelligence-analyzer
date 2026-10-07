#!/usr/bin/env bash
# Debug session 2d8d9e — capture docker/npm network evidence for ECONNRESET builds
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="$ROOT/debug-2d8d9e.log"
SESSION="2d8d9e"
TS_MS() { date +%s%3N 2>/dev/null || python3 -c 'import time;print(int(time.time()*1000))'; }

log_json() {
  local hypothesis_id="$1"
  local location="$2"
  local message="$3"
  local data_json="$4"
  local ts
  ts="$(TS_MS)"
  printf '%s\n' "{\"sessionId\":\"$SESSION\",\"hypothesisId\":\"$hypothesis_id\",\"location\":\"$location\",\"message\":\"$message\",\"data\":$data_json,\"timestamp\":$ts,\"runId\":\"pre-fix\"}" >> "$LOG"
  echo "[$hypothesis_id] $message — $data_json"
}

echo "Writing NDJSON evidence to: $LOG"
: > "$LOG"

# #region agent log
# Hypothesis A: host egress to registry.npmjs.org is broken/flaky
# #endregion
HOST_CODE=0
HOST_BODY=""
if command -v curl >/dev/null 2>&1; then
  HOST_BODY="$(curl -sS -o /tmp/npm-host-ping.json -w '%{http_code}' --max-time 30 https://registry.npmjs.org/-/ping 2>/tmp/npm-host-err || true)"
  HOST_CODE="$HOST_BODY"
  HOST_ERR="$(tr '\n' ' ' </tmp/npm-host-err 2>/dev/null || true)"
else
  HOST_CODE="nocurl"
  HOST_ERR="curl missing"
fi
log_json "A" "debug-docker-npm-network.sh:host" "host registry.npmjs.org ping" \
  "{\"httpCode\":\"$HOST_CODE\",\"err\":\"${HOST_ERR:-}\"}"

# #region agent log
# Hypothesis B: Docker build network cannot reach npm registry
# #endregion
DOCKER_NPM_OUT="$(docker run --rm node:22-alpine sh -c 'npm ping --registry=https://registry.npmjs.org 2>&1; echo EXIT:$?' 2>&1 || true)"
DOCKER_NPM_EXIT="$(echo "$DOCKER_NPM_OUT" | sed -n 's/^EXIT://p' | tail -1)"
DOCKER_NPM_SNIP="$(echo "$DOCKER_NPM_OUT" | tr '\n' ' ' | cut -c1-400)"
log_json "B" "debug-docker-npm-network.sh:docker-npm" "docker container npm ping" \
  "{\"exit\":\"${DOCKER_NPM_EXIT:-unknown}\",\"snippet\":\"$DOCKER_NPM_SNIP\"}"

# #region agent log
# Hypothesis C: Alpine apk repos also flaky (broader Docker egress)
# #endregion
DOCKER_APK_OUT="$(docker run --rm node:22-alpine sh -c 'apk update 2>&1 | tail -5; echo EXIT:$?' 2>&1 || true)"
DOCKER_APK_EXIT="$(echo "$DOCKER_APK_OUT" | sed -n 's/^EXIT://p' | tail -1)"
DOCKER_APK_SNIP="$(echo "$DOCKER_APK_OUT" | tr '\n' ' ' | cut -c1-400)"
log_json "C" "debug-docker-npm-network.sh:docker-apk" "docker container apk update" \
  "{\"exit\":\"${DOCKER_APK_EXIT:-unknown}\",\"snippet\":\"$DOCKER_APK_SNIP\"}"

# #region agent log
# Hypothesis D: npm defaults (few retries / short timeouts) abort on first reset
# #endregion
DOCKER_CFG_OUT="$(docker run --rm node:22-alpine sh -c 'npm config get fetch-retries; npm config get fetch-retry-maxtimeout; npm config get fetch-timeout; npm config get maxsockets' 2>&1 || true)"
DOCKER_CFG_SNIP="$(echo "$DOCKER_CFG_OUT" | tr '\n' '|' | cut -c1-200)"
log_json "D" "debug-docker-npm-network.sh:npm-defaults" "npm default network settings in node:22-alpine" \
  "{\"values\":\"$DOCKER_CFG_SNIP\"}"

# #region agent log
# Hypothesis E: concurrent BuildKit installs amplify resets — timed single-package install
# #endregion
DOCKER_INSTALL_OUT="$(docker run --rm node:22-alpine sh -c 'npm install left-pad@1.3.0 --no-save --fetch-retries=5 --fetch-retry-maxtimeout=120000 --fetch-timeout=300000 2>&1; echo EXIT:$?' 2>&1 || true)"
DOCKER_INSTALL_EXIT="$(echo "$DOCKER_INSTALL_OUT" | sed -n 's/^EXIT://p' | tail -1)"
DOCKER_INSTALL_SNIP="$(echo "$DOCKER_INSTALL_OUT" | tr '\n' ' ' | cut -c1-400)"
log_json "E" "debug-docker-npm-network.sh:docker-install" "docker single-package npm install with retries" \
  "{\"exit\":\"${DOCKER_INSTALL_EXIT:-unknown}\",\"snippet\":\"$DOCKER_INSTALL_SNIP\"}"

echo ""
echo "Done. Log file: $LOG"
echo "If this host is not the Cursor workspace, copy debug-2d8d9e.log into the repo root on your workstation, then Press Proceed."
