#!/usr/bin/env bash
# WebinoDashboard updater (tarball installs without .git).
# Usage:
#   bash <(curl -fsSL https://raw.githubusercontent.com/WebinaDev/WebinoDashboard/main/scripts/update.sh)
#
# Optional:
#   WEBINO_INSTALL_DIR=/www/wwwroot/WebinoDashboard
#   WEBINO_BRANCH=main
set -euo pipefail

REPO_SLUG="${WEBINO_REPO_SLUG:-WebinaDev/WebinoDashboard}"
BRANCH="${WEBINO_BRANCH:-main}"
TARBALL_URL="${WEBINO_TARBALL_URL:-https://github.com/${REPO_SLUG}/archive/refs/heads/${BRANCH}.tar.gz}"

if [[ -d /www/wwwroot/WebinoDashboard ]]; then
  DEFAULT_DIR="/www/wwwroot/WebinoDashboard"
else
  DEFAULT_DIR="${PWD}/WebinoDashboard"
fi
TARGET="${WEBINO_INSTALL_DIR:-$DEFAULT_DIR}"

log() { printf '\033[1;34m[webino]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[webino]\033[0m %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif have docker-compose; then
    docker-compose "$@"
  else
    die "Docker Compose is not installed."
  fi
}

[[ -d "$TARGET" ]] || die "Install dir not found: $TARGET"
have curl || die "curl is required."
have tar || die "tar is required."

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

log "Backing up env files..."
cp -a "$TARGET/.env" "$tmpdir/root.env" 2>/dev/null || true
cp -a "$TARGET/backend/.env" "$tmpdir/backend.env" 2>/dev/null || true

log "Downloading WebinoDashboard (${BRANCH})..."
curl -fL --connect-timeout 20 --max-time 180 --retry 2 \
  -o "$tmpdir/webino.tar.gz" "$TARBALL_URL"
tar -xzf "$tmpdir/webino.tar.gz" -C "$tmpdir"
src=$(find "$tmpdir" -mindepth 1 -maxdepth 1 -type d | head -1)
[[ -n "$src" ]] || die "Archive extract failed."

log "Replacing code in $TARGET (env preserved)..."
rm -rf "$TARGET"
mv "$src" "$TARGET"
cp -a "$tmpdir/root.env" "$TARGET/.env" 2>/dev/null || true
cp -a "$tmpdir/backend.env" "$TARGET/backend/.env" 2>/dev/null || true
chmod +x "$TARGET/bootstrap.sh" "$TARGET/scripts/"*.sh 2>/dev/null || true

cd "$TARGET"
bash "$TARGET/scripts/validate.sh" 2>/dev/null || true
log "Rebuilding and restarting stack..."
compose -f docker-compose.aapanel.yml up -d --build
compose -f docker-compose.aapanel.yml exec -T backend php artisan migrate --force
compose -f docker-compose.aapanel.yml ps
log "Update complete."
