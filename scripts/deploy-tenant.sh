#!/usr/bin/env bash
# Fast, verified rollout of WebinoDashboard images to a tenant stack.
#
# Why: building on the tenant server costs 10–15 minutes because every build starts
# from a cold layer cache. This script builds once on the operator machine (warm cache),
# streams the image over SSH, and only then touches the running stack.
#
#   SSH_TARGET=root@host TENANT=mars SITE_DIR=/var/lib/webino/sites/mars \
#     scripts/deploy-tenant.sh            # build locally + stream
#
#   IMAGE_TAG=<sha> SSH_TARGET=... scripts/deploy-tenant.sh --pull   # pull prebuilt GHCR images
#
# Env:
#   SSH_TARGET   required: user@host
#   TENANT       required: compose project / site slug (e.g. mars)
#   SITE_DIR     required: absolute path of the tenant compose dir
#   IMAGE_TAG    optional: tag to build/pull (default: short git sha)
#   SKIP_MIGRATE optional: 1 to skip `artisan migrate`
#   HEALTH_URL   optional: public URL probed after rollout (default https://<domain>)
#   ROLLBACK_ON_FAIL default 1: restore the previous compose + images when health fails
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="build"
[[ "${1:-}" == "--pull" ]] && MODE="pull"

SSH_TARGET="${SSH_TARGET:-}"
TENANT="${TENANT:-}"
SITE_DIR="${SITE_DIR:-}"
[[ -n "$SSH_TARGET" && -n "$TENANT" && -n "$SITE_DIR" ]] || {
  echo "deploy-tenant: set SSH_TARGET, TENANT and SITE_DIR" >&2; exit 2; }

IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD)}"
REGISTRY="${REGISTRY:-ghcr.io/webinadev}"
BACKEND_IMAGE="webino-backend:${IMAGE_TAG}"
FRONTEND_IMAGE="webino-next:${IMAGE_TAG}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="/var/backups/webino/${TENANT}/${STAMP}-deploy"

log() { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[deploy]\033[0m %s\n' "$*" >&2; exit 1; }

ssh_run() { ssh -o BatchMode=no -o ConnectTimeout=20 "$SSH_TARGET" "$@"; }

# ---------------------------------------------------------------- build/pull
if [[ "$MODE" == "pull" ]]; then
  log "pulling ${REGISTRY}/webino-dashboard-{backend,frontend}:${IMAGE_TAG} on the server"
  ssh_run "docker pull ${REGISTRY}/webino-dashboard-backend:${IMAGE_TAG} \
        && docker pull ${REGISTRY}/webino-dashboard-frontend:${IMAGE_TAG} \
        && docker tag ${REGISTRY}/webino-dashboard-backend:${IMAGE_TAG} ${BACKEND_IMAGE} \
        && docker tag ${REGISTRY}/webino-dashboard-frontend:${IMAGE_TAG} ${FRONTEND_IMAGE}"
else
  log "building backend ${BACKEND_IMAGE} (warm local cache)"
  docker build -f docker/php/Dockerfile.platform -t "$BACKEND_IMAGE" .
  log "building frontend ${FRONTEND_IMAGE} (warm local cache)"
  docker build -f docker/next/Dockerfile -t "$FRONTEND_IMAGE" .
  log "streaming images to ${SSH_TARGET}"
  docker save "$BACKEND_IMAGE" "$FRONTEND_IMAGE" | gzip -1 | ssh_run 'gunzip | docker load'
fi

# ---------------------------------------------------------------- backup
log "backing up ${TENANT} to ${BACKUP_DIR}"
ssh_run "set -e
  mkdir -p '${BACKUP_DIR}'
  cd '${SITE_DIR}'
  cp docker-compose.yml '${BACKUP_DIR}/docker-compose.yml'
  grep -E '^image:' docker-compose.yml > '${BACKUP_DIR}/previous-images.txt' || true
  docker compose exec -T db sh -c 'pg_dump -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\"' | gzip > '${BACKUP_DIR}/db.sql.gz'
  sha256sum '${BACKUP_DIR}/db.sql.gz' > '${BACKUP_DIR}/SHA256SUMS'
  echo '${BACKUP_DIR}'"

# ---------------------------------------------------------------- rollout
log "updating compose image tags"
ssh_run "set -e
  cd '${SITE_DIR}'
  cp docker-compose.yml docker-compose.yml.pre-${IMAGE_TAG}
  sed -i -E 's#^(\s*image:\s*)webino-backend:.*#\1${BACKEND_IMAGE}#; s#^(\s*image:\s*)webino-next:.*#\1${FRONTEND_IMAGE}#' docker-compose.yml
  docker compose up -d --no-build ws-${TENANT}-backend ws-${TENANT}-frontend"

if [[ "${SKIP_MIGRATE:-0}" != 1 ]]; then
  log "running migrations"
  ssh_run "cd '${SITE_DIR}' && docker compose exec -T ws-${TENANT}-backend php artisan migrate --force"
fi

# ---------------------------------------------------------------- health
HEALTH_URL="${HEALTH_URL:-}"
if [[ -z "$HEALTH_URL" ]]; then
  DOMAIN="$(ssh_run "cd '${SITE_DIR}' && grep -m1 '^APP_URL=' .env | cut -d= -f2- | tr -d '\"'")"
  HEALTH_URL="${DOMAIN%/}/"
fi
log "health check ${HEALTH_URL}"
ok=0
for i in $(seq 1 30); do
  code="$(ssh_run "docker run --rm --network host curlimages/curl:latest -s -o /dev/null -w '%{http_code}' -m 10 '${HEALTH_URL}'" 2>/dev/null || echo 000)"
  [[ "$code" == "200" ]] && { ok=1; break; }
  sleep 4
done

if [[ "$ok" != 1 ]]; then
  echo "deploy-tenant: health check failed for ${HEALTH_URL}" >&2
  if [[ "${ROLLBACK_ON_FAIL:-1}" == 1 ]]; then
    log "rolling back to ${BACKUP_DIR}/docker-compose.yml"
    ssh_run "cd '${SITE_DIR}' && cp '${BACKUP_DIR}/docker-compose.yml' docker-compose.yml && docker compose up -d --no-build ws-${TENANT}-backend ws-${TENANT}-frontend"
  fi
  exit 1
fi

log "done: ${TENANT} now runs ${BACKEND_IMAGE} + ${FRONTEND_IMAGE} (backup: ${BACKUP_DIR})"
