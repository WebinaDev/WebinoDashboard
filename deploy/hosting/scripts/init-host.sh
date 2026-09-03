#!/usr/bin/env bash
# Bootstrap /opt/webino host layout: edge network, shared images, global Caddy.
#
# Usage (from repo or after rsync of deploy/hosting):
#   WEBINO_ROOT=/opt/webino WEBINO_CODE=/path/to/WebinoDashboard \
#     ./deploy/hosting/scripts/init-host.sh
#
# Env:
#   WEBINO_ROOT   Install root (default: /opt/webino)
#   WEBINO_CODE   Path to WebinoDashboard checkout used to build images
#                 (default: parent of this script's ../../.. = repo root)
#   SKIP_BUILD=1  Skip docker image build
#   SKIP_PROXY=1  Skip starting the global proxy

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOSTING_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${HOSTING_DIR}/../.." && pwd)"

WEBINO_ROOT="${WEBINO_ROOT:-/opt/webino}"
WEBINO_CODE="${WEBINO_CODE:-$REPO_ROOT}"
SKIP_BUILD="${SKIP_BUILD:-0}"
SKIP_PROXY="${SKIP_PROXY:-0}"

log() { printf '[webino-host] %s\n' "$*"; }
die() { printf '[webino-host] ERROR: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker is required"
docker compose version >/dev/null 2>&1 || die "docker compose plugin is required"

log "WEBINO_ROOT=${WEBINO_ROOT}"
log "WEBINO_CODE=${WEBINO_CODE}"

mkdir -p "${WEBINO_ROOT}/clients" "${WEBINO_ROOT}/proxy" "${WEBINO_ROOT}/template"

# Sync golden template + proxy + scripts into install root
rsync -a --delete \
  "${HOSTING_DIR}/template/" "${WEBINO_ROOT}/template/"
# Sync proxy sources but never clobber a generated Caddyfile
rsync -a \
  --exclude 'Caddyfile' \
  "${HOSTING_DIR}/proxy/" "${WEBINO_ROOT}/proxy/"
rsync -a --delete \
  "${HOSTING_DIR}/scripts/" "${WEBINO_ROOT}/scripts/"
chmod +x "${WEBINO_ROOT}/scripts/"*.sh

# Edge network shared by proxy + every client frontend/backend
if docker network inspect webino-edge >/dev/null 2>&1; then
  log "network webino-edge already exists"
else
  docker network create webino-edge
  log "created network webino-edge"
fi

# Build shared images once from the code checkout
if [[ "$SKIP_BUILD" != "1" ]]; then
  [[ -f "${WEBINO_CODE}/docker/php/Dockerfile.platform" ]] || die "missing backend Dockerfile under ${WEBINO_CODE}"
  [[ -f "${WEBINO_CODE}/docker/next/Dockerfile" ]] || die "missing frontend Dockerfile under ${WEBINO_CODE}"

  log "building webino-dashboard-backend:latest"
  docker build -f "${WEBINO_CODE}/docker/php/Dockerfile.platform" \
    -t webino-dashboard-backend:latest \
    "${WEBINO_CODE}"

  log "building webino-dashboard-frontend:latest"
  docker build -f "${WEBINO_CODE}/docker/next/Dockerfile" \
    --build-arg API_PROXY_TARGET=http://backend:8080 \
    -t webino-dashboard-frontend:latest \
    "${WEBINO_CODE}"
else
  log "SKIP_BUILD=1 — assuming images already exist"
fi

# Seed placeholder Caddyfile only on first install; otherwise rebuild from clients
if [[ ! -f "${WEBINO_ROOT}/proxy/Caddyfile" ]]; then
  cp "${HOSTING_DIR}/proxy/Caddyfile" "${WEBINO_ROOT}/proxy/Caddyfile"
fi

if [[ "$SKIP_PROXY" != "1" ]]; then
  log "starting global Caddy proxy"
  (cd "${WEBINO_ROOT}/proxy" && docker compose up -d)
  if [[ -x "${WEBINO_ROOT}/scripts/render-proxy.sh" ]]; then
    WEBINO_ROOT="${WEBINO_ROOT}" "${WEBINO_ROOT}/scripts/render-proxy.sh" || true
  fi
else
  log "SKIP_PROXY=1 — proxy not started"
fi

log "done. Next: ${WEBINO_ROOT}/scripts/new-client.sh <slug> <domain>"
