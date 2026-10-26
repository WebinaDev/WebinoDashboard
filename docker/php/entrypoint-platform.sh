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

[ -e public/storage ] || php artisan storage:link >/dev/null 2>&1 || ln -sfn /var/www/html/storage/app/public public/storage || true
mkdir -p database storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache
touch database/database.sqlite 2>/dev/null || true
chown -R www-data:www-data storage bootstrap/cache database 2>/dev/null || true

if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
  echo "[webino] Running migrations..."
  i=1
  migrated=0
  while [ "$i" -le 12 ]; do
    if php artisan migrate --force --no-interaction; then
      migrated=1
      break
    fi
    echo "[webino] migrate attempt $i failed; retrying in 5s..." >&2
    i=$((i + 1))
    sleep 5
  done
  if [ "$migrated" != "1" ]; then
    echo "[webino] migrations failed after retries." >&2
    exit 1
  fi
fi

# bootstrap/app.php reads these with env() before config loads; once config is cached the
# .env file is no longer parsed, so export them from the mounted .env into the process env.
for key in TRUSTED_PROXIES AUTH_COOKIE_NAME; do
  if [ -z "$(printenv "$key" 2>/dev/null)" ] && [ -f .env ]; then
    val="$(grep -E "^${key}=" .env | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
    if [ -n "$val" ]; then export "$key=$val"; fi
  fi
done

# Cache config/routes/views/events (on by default; RUN_OPTIMIZE=0 to skip). Never fatal.
if [ "${RUN_OPTIMIZE:-1}" = "1" ]; then
  # Not optimize:clear: that would also flush the shared Redis app cache on every start.
  php artisan config:clear >/dev/null 2>&1 || true
  if ! php artisan optimize; then
    echo "[webino] artisan optimize failed; continuing uncached" >&2
    php artisan config:clear >/dev/null 2>&1 || true
    php artisan route:clear >/dev/null 2>&1 || true
  fi
  chown -R www-data:www-data bootstrap/cache storage/framework 2>/dev/null || true
fi

# Rollback switch: WEBINO_HTTP_SERVER=serve runs the old single-process `artisan serve` on :8080.
if [ "${WEBINO_HTTP_SERVER:-fpm}" = "serve" ]; then
  case " $* " in
    *" webino-web "*|" webino-web "|*" artisan serve "*|*" octane:start "*|*" octane:start")
      echo "[webino] WEBINO_HTTP_SERVER=serve -> php artisan serve on :8080 (rollback mode)"
      exec php artisan serve --host=0.0.0.0 --port=8080
      ;;
  esac
fi

# Legacy CMDs (artisan serve / octane:start) -> php-fpm + nginx on :8080 (multi-worker).
case " $* " in
  *" artisan serve "*|*" octane:start "*|*" octane:start")
    echo "[webino] Starting php-fpm + nginx on :8080"
    exec /usr/local/bin/webino-web
    ;;
esac

exec "$@"
