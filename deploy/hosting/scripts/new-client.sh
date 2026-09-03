#!/usr/bin/env bash
# Provision an isolated client stack under /opt/webino/clients/<slug>.
#
# Usage:
#   ./new-client.sh <slug> <domain>
#   WEBINO_ROOT=/opt/webino ./new-client.sh acme acme.example.com
#
# Env:
#   WEBINO_ROOT   Install root (default: /opt/webino)
#   SKIP_UP=1     Only create files; do not compose up
#   SKIP_PROXY=1  Do not re-render / reload Caddy

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBINO_ROOT="${WEBINO_ROOT:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
SKIP_UP="${SKIP_UP:-0}"
SKIP_PROXY="${SKIP_PROXY:-0}"

log() { printf '[webino-client] %s\n' "$*"; }
die() { printf '[webino-client] ERROR: %s\n' "$*" >&2; exit 1; }

SLUG="${1:-}"
DOMAIN="${2:-}"

[[ -n "$SLUG" && -n "$DOMAIN" ]] || die "usage: $0 <slug> <domain>"
[[ "$SLUG" =~ ^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$ ]] || die "slug must be DNS-safe lowercase (a-z0-9-)"

TEMPLATE="${WEBINO_ROOT}/template"
CLIENT_DIR="${WEBINO_ROOT}/clients/${SLUG}"

[[ -d "$TEMPLATE" ]] || die "template missing: ${TEMPLATE} (run init-host.sh first)"
[[ -f "${TEMPLATE}/docker-compose.yml" ]] || die "template compose missing"
command -v docker >/dev/null 2>&1 || die "docker is required"

if [[ -d "$CLIENT_DIR" ]]; then
  die "client already exists: ${CLIENT_DIR}"
fi

rand_password() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 24 | tr -d '\n/+=\r' | head -c 32
  else
    head -c 32 /dev/urandom | base64 | tr -d '\n/+=\r' | head -c 32
  fi
}

rand_app_key() {
  if command -v openssl >/dev/null 2>&1; then
    printf 'base64:%s' "$(openssl rand -base64 32 | tr -d '\n')"
  else
    printf 'base64:%s' "$(head -c 32 /dev/urandom | base64 | tr -d '\n')"
  fi
}

PG_PASS="$(rand_password)"
APP_KEY="$(rand_app_key)"

mkdir -p "${CLIENT_DIR}/data/db" "${CLIENT_DIR}/data/redis" "${CLIENT_DIR}/data/storage/"{app,framework/{cache,sessions,views},logs}
# Laravel storage tree
mkdir -p \
  "${CLIENT_DIR}/data/storage/app/public" \
  "${CLIENT_DIR}/data/storage/framework/cache/data" \
  "${CLIENT_DIR}/data/storage/framework/sessions" \
  "${CLIENT_DIR}/data/storage/framework/views" \
  "${CLIENT_DIR}/data/storage/logs"

cp "${TEMPLATE}/docker-compose.yml" "${CLIENT_DIR}/docker-compose.yml"

cat > "${CLIENT_DIR}/.env" <<EOF
CLIENT_SLUG=${SLUG}
CLIENT_DOMAIN=${DOMAIN}
POSTGRES_DB=webino_dashboard
POSTGRES_USER=webino
POSTGRES_PASSWORD=${PG_PASS}
EOF

# backend.env from template with substitutions
sed \
  -e "s|^APP_KEY=.*|APP_KEY=${APP_KEY}|" \
  -e "s|^APP_URL=.*|APP_URL=https://${DOMAIN}|" \
  -e "s|^DB_PASSWORD=.*|DB_PASSWORD=${PG_PASS}|" \
  -e "s|^FRONTEND_URL=.*|FRONTEND_URL=https://${DOMAIN}|" \
  -e "s|^SANCTUM_STATEFUL_DOMAINS=.*|SANCTUM_STATEFUL_DOMAINS=${DOMAIN}|" \
  -e "s|^WEBINO_BASE_URL=.*|WEBINO_BASE_URL=https://${DOMAIN}|" \
  -e "s|^MAIL_FROM_ADDRESS=.*|MAIL_FROM_ADDRESS=\"noreply@${DOMAIN}\"|" \
  "${TEMPLATE}/backend.env.example" > "${CLIENT_DIR}/backend.env"

log "created ${CLIENT_DIR}"
log "domain=${DOMAIN} slug=${SLUG}"

export COMPOSE_PROJECT_NAME="webino-${SLUG}"

if [[ "$SKIP_UP" != "1" ]]; then
  docker network inspect webino-edge >/dev/null 2>&1 || die "network webino-edge missing — run init-host.sh"
  docker image inspect webino-dashboard-backend:latest >/dev/null 2>&1 || die "image webino-dashboard-backend:latest missing — run init-host.sh"
  docker image inspect webino-dashboard-frontend:latest >/dev/null 2>&1 || die "image webino-dashboard-frontend:latest missing — run init-host.sh"

  log "starting stack (project ${COMPOSE_PROJECT_NAME})"
  (cd "$CLIENT_DIR" && docker compose --env-file .env up -d)
else
  log "SKIP_UP=1 — files only"
fi

if [[ "$SKIP_PROXY" != "1" ]]; then
  WEBINO_ROOT="${WEBINO_ROOT}" "${WEBINO_ROOT}/scripts/render-proxy.sh"
else
  log "SKIP_PROXY=1 — run render-proxy.sh manually"
fi

log "done. Point DNS for ${DOMAIN} at this server; Caddy will issue TLS."
log "manage: cd ${CLIENT_DIR} && COMPOSE_PROJECT_NAME=webino-${SLUG} docker compose --env-file .env ps"
