#!/bin/sh
set -e

if [ ! -f vendor/autoload.php ]; then
  echo "[webino] Backend vendor missing in image." >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "[webino] Missing .env mount." >&2
  exit 1
fi

mkdir -p database storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache
touch database/database.sqlite 2>/dev/null || true

exec "$@"
