#!/bin/sh
set -e

if [ ! -f vendor/autoload.php ]; then
  echo "[webino] Backend not installed. Run ./install.sh from the project root first." >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "[webino] Missing backend/.env. Run ./install.sh from the project root first." >&2
  exit 1
fi

# Public /storage/* URLs need this symlink; missing link → broken product images.
if [ ! -e public/storage ]; then
  php artisan storage:link >/dev/null 2>&1 || ln -sfn /var/www/html/storage/app/public /var/www/html/public/storage || true
fi

exec "$@"
