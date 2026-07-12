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

exec "$@"
