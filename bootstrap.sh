#!/usr/bin/env bash
# WebinoDashboard one-line Docker installer.
# Usage:
#   bash <(curl -fsSL https://raw.githubusercontent.com/WebinaDev/WebinoDashboard/main/bootstrap.sh)
#
# Optional env:
#   WEBINO_DOMAIN=shop.example.com
#   WEBINO_HTTP_PORT=3080
#   WEBINO_HTTPS_PORT=3443
#   WEBINO_INSTALL_DIR=/www/wwwroot/WebinoDashboard
#   WEBINO_BRANCH=main
set -euo pipefail

REPO_SLUG="${WEBINO_REPO_SLUG:-WebinaDev/WebinoDashboard}"
BRANCH="${WEBINO_BRANCH:-main}"
BOOTSTRAP_URL="${WEBINO_BOOTSTRAP_URL:-https://raw.githubusercontent.com/${REPO_SLUG}/${BRANCH}/bootstrap.sh}"
TARBALL_URL="${WEBINO_TARBALL_URL:-https://github.com/${REPO_SLUG}/archive/refs/heads/${BRANCH}.tar.gz}"
GIT_URL="${WEBINO_REPO:-https://github.com/${REPO_SLUG}.git}"

if [[ -d /www/wwwroot ]]; then
  DEFAULT_DIR="/www/wwwroot/WebinoDashboard"
else
  DEFAULT_DIR="${PWD}/WebinoDashboard"
fi
TARGET="${WEBINO_INSTALL_DIR:-$DEFAULT_DIR}"

log() { printf '\033[1;34m[webino]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[webino]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[webino]\033[0m %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# Re-exec from tty when piped (so prompts work).
if [[ ! -t 0 && -e /dev/tty ]]; then
  exec bash <(curl -fsSL "$BOOTSTRAP_URL") "$@" </dev/tty >/dev/tty 2>&1
fi

need_root() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    return 0
  fi
  have sudo || die "Run as root, or install sudo."
}

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif have docker-compose; then
    docker-compose "$@"
  else
    die "Docker Compose is not installed."
  fi
}

ensure_curl_tar() {
  have curl && have tar && return 0
  log "Installing curl and tar..."
  if have apt-get; then
    apt-get update -qq && apt-get install -y curl tar ca-certificates
  elif have dnf; then
    dnf install -y curl tar ca-certificates
  elif have yum; then
    yum install -y curl tar ca-certificates
  fi
  have curl && have tar || die "curl and tar are required."
}

ensure_docker() {
  if have docker && docker info >/dev/null 2>&1; then
    return 0
  fi
  if have docker && ! docker info >/dev/null 2>&1; then
    die "Docker is installed but the daemon is not running. Start it, then retry."
  fi
  log "Installing Docker..."
  if have apt-get; then
    apt-get update -qq
    apt-get install -y docker.io docker-compose-plugin || apt-get install -y docker.io docker-compose
    systemctl enable --now docker 2>/dev/null || service docker start || true
  elif have dnf; then
    dnf install -y docker docker-compose-plugin
    systemctl enable --now docker
  else
    die "Install Docker (and Docker Compose) first, then re-run this installer."
  fi
  have docker || die "Docker install failed."
  docker info >/dev/null 2>&1 || die "Docker daemon is not running."
}

port_in_use() {
  local port="$1"
  if have ss; then
    ss -lnt | awk '{print $4}' | grep -Eq ":${port}$"
  elif have netstat; then
    netstat -lnt 2>/dev/null | awk '{print $4}' | grep -Eq ":${port}$"
  else
    return 1
  fi
}

rand_secret() {
  if have openssl; then
    openssl rand -base64 32 | tr -d '\n/+=\r' | head -c 32
  else
    head -c 32 /dev/urandom | base64 | tr -d '\n/+=\r' | head -c 32
  fi
}

app_key() {
  if have openssl; then
    printf 'base64:%s' "$(openssl rand -base64 32 | tr -d '\n')"
  else
    printf 'base64:%s' "$(head -c 32 /dev/urandom | base64 | tr -d '\n')"
  fi
}

download_source() {
  if [[ -f "$TARGET/docker-compose.aapanel.yml" && -f "$TARGET/bootstrap.sh" ]]; then
    log "Using existing checkout: $TARGET"
    return 0
  fi

  ensure_curl_tar
  log "Downloading WebinoDashboard (${BRANCH})..."
  local tmpdir archive extract_dir
  tmpdir=$(mktemp -d)
  archive="$tmpdir/webino.tar.gz"
  if curl -fL --connect-timeout 20 --max-time 180 --retry 2 -o "$archive" "$TARBALL_URL"; then
    tar -xzf "$archive" -C "$tmpdir"
    extract_dir=$(find "$tmpdir" -mindepth 1 -maxdepth 1 -type d | head -1)
    [[ -n "$extract_dir" ]] || die "Archive extract failed."
    mkdir -p "$(dirname "$TARGET")"
    rm -rf "$TARGET"
    mv "$extract_dir" "$TARGET"
    rm -rf "$tmpdir"
    return 0
  fi
  rm -rf "$tmpdir"
  warn "Tarball download failed — cloning with git..."
  have git || { apt-get update -qq && apt-get install -y git; }
  have git || die "git is required."
  mkdir -p "$(dirname "$TARGET")"
  rm -rf "$TARGET"
  git clone --depth 1 --branch "$BRANCH" "$GIT_URL" "$TARGET"
}

write_env() {
  local domain="${WEBINO_DOMAIN:-}"
  local http_port="${WEBINO_HTTP_PORT:-}"
  local https_port="${WEBINO_HTTPS_PORT:-3443}"
  local db_pass app_url stateful origins key

  if [[ -z "$http_port" ]]; then
    if port_in_use 80; then
      http_port=3080
      warn "Port 80 is in use (typical on aaPanel). Binding Docker to ${http_port}."
    else
      http_port=80
    fi
  fi

  if [[ -z "$domain" ]]; then
    domain="localhost"
  fi

  if [[ "$http_port" == "80" || "$http_port" == "443" ]]; then
    if [[ "$domain" == "localhost" || "$domain" == "127.0.0.1" ]]; then
      app_url="http://${domain}"
    else
      app_url="https://${domain}"
    fi
  else
    app_url="http://${domain}:${http_port}"
  fi

  db_pass="${POSTGRES_PASSWORD:-$(rand_secret)}"
  stateful="${domain},www.${domain},localhost,127.0.0.1"
  origins="${app_url}"
  key="$(app_key)"

  cat >"$TARGET/.env" <<EOF
POSTGRES_DB=webino_dashboard
POSTGRES_USER=webino
POSTGRES_PASSWORD=${db_pass}
WEB_HTTP_PORT=${http_port}
WEB_HTTPS_PORT=${https_port}
EOF

  cp "$TARGET/backend/.env.example" "$TARGET/backend/.env"
  sed -i \
    -e "s|^APP_ENV=.*|APP_ENV=production|" \
    -e "s|^APP_DEBUG=.*|APP_DEBUG=false|" \
    -e "s|^APP_URL=.*|APP_URL=${app_url}|" \
    -e "s|^APP_KEY=.*|APP_KEY=${key}|" \
    -e "s|^DB_CONNECTION=.*|DB_CONNECTION=pgsql|" \
    -e "s|^FRONTEND_URL=.*|FRONTEND_URL=${app_url}|" \
    -e "s|^SANCTUM_STATEFUL_DOMAINS=.*|SANCTUM_STATEFUL_DOMAINS=${stateful}|" \
    -e "s|^CORS_ALLOWED_ORIGINS=.*|CORS_ALLOWED_ORIGINS=${origins}|" \
    "$TARGET/backend/.env"

  log "Wrote $TARGET/.env and $TARGET/backend/.env"
  log "Public URL: ${app_url}"
  if [[ "$http_port" != "80" ]]; then
    warn "aaPanel: add a site for ${domain}, enable SSL, reverse-proxy to http://127.0.0.1:${http_port}"
  fi
}

backend_app_key_set() {
  local backend_env="$1"
  local key
  [[ -f "$backend_env" ]] || return 1
  key=$(grep -E '^APP_KEY=' "$backend_env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d ' "'\''')
  [[ -n "$key" && "$key" != "base64:" ]]
}

ensure_backend_env() {
  local backend_env="$TARGET/backend/.env"

  if backend_app_key_set "$backend_env"; then
    return 0
  fi

  if [[ ! -f "$backend_env" ]]; then
    warn "backend/.env is missing — creating it before Docker start."
    if [[ ! -f "$TARGET/.env" ]]; then
      write_env
      return 0
    fi
    [[ -f "$TARGET/backend/.env.example" ]] || die "Missing $TARGET/backend/.env.example"
    cp "$TARGET/backend/.env.example" "$backend_env"
  else
    warn "backend/.env has no APP_KEY — generating one before Docker start."
  fi

  local key
  key="$(app_key)"
  sed -i "s|^APP_KEY=.*|APP_KEY=${key}|" "$backend_env"
  log "Ensured $backend_env has APP_KEY"
}

start_stack() {
  cd "$TARGET"
  log "Building and starting Docker stack (this can take several minutes)..."
  compose -f docker-compose.aapanel.yml up -d --build
  log "Stack is up."
  compose -f docker-compose.aapanel.yml ps
  echo
  log "Admin: ${WEBINO_DOMAIN:-localhost}  →  /admin"
  log "Logs:  cd $TARGET && docker compose -f docker-compose.aapanel.yml logs -f"
}

need_root
ensure_docker
download_source
[[ -f "$TARGET/docker-compose.aapanel.yml" ]] || die "Checkout incomplete: $TARGET"
chmod +x "$TARGET/bootstrap.sh" "$TARGET/scripts/"*.sh 2>/dev/null || true
if [[ -f "$TARGET/scripts/validate.sh" ]]; then
  bash "$TARGET/scripts/validate.sh" || die "Pre-flight validation failed"
fi
if [[ -f "$TARGET/.env" && -f "$TARGET/backend/.env" && "${WEBINO_FORCE_ENV:-0}" != "1" ]]; then
  log "Keeping existing env files (set WEBINO_FORCE_ENV=1 to regenerate)"
else
  write_env
fi
ensure_backend_env
start_stack
