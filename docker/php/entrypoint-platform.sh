#!/bin/sh
set -e

if [ ! -f vendor/autoload.php ]; then
  echo "[webino] Backend vendor missing in image." >&2
  exit 1
fi

if [ ! -f .env ]; then
  if [ -n "${APP_KEY:-}" ]; then
    echo "[webino] .env file not mounted — writing minimal fallback from environment." >&2
    {
      echo "APP_NAME=Laravel"
      echo "APP_ENV=${APP_ENV:-production}"
      echo "APP_KEY=${APP_KEY}"
      echo "APP_DEBUG=${APP_DEBUG:-false}"
      echo "APP_URL=${APP_URL:-http://localhost}"
      echo "DB_CONNECTION=${DB_CONNECTION:-pgsql}"
      echo "DB_HOST=${DB_HOST:-db}"
      echo "DB_PORT=${DB_PORT:-5432}"
      echo "DB_DATABASE=${DB_DATABASE:-webino_dashboard}"
      echo "DB_USERNAME=${DB_USERNAME:-webino}"
      echo "DB_PASSWORD=${DB_PASSWORD:-}"
      echo "REDIS_HOST=${REDIS_HOST:-redis}"
      echo "REDIS_PORT=${REDIS_PORT:-6379}"
      echo "CACHE_STORE=${CACHE_STORE:-redis}"
      echo "SESSION_DRIVER=${SESSION_DRIVER:-redis}"
      echo "QUEUE_CONNECTION=${QUEUE_CONNECTION:-redis}"
    } > .env
  else
    echo "[webino] Missing .env mount and APP_KEY is not set." >&2
    exit 1
  fi
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
