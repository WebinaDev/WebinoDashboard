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
chown -R www-data:www-data storage bootstrap/cache database 2>/dev/null || true

if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
  echo "[webino] Running migrations..."
  php artisan migrate --force --no-interaction
fi

if [ "${RUN_OPTIMIZE:-0}" = "1" ]; then
  php artisan config:cache
  php artisan route:cache
  php artisan view:cache
fi

exec "$@"
