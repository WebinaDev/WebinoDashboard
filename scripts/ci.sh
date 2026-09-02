#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

bash "$ROOT/scripts/validate.sh"

echo "==> Frontend: TypeScript"
cd frontend
npx tsc --noEmit

echo "==> Frontend: lint"
npm run lint

echo "==> Frontend: production build"
npm run build
cd "$ROOT"

echo "==> Backend: PHPUnit (Docker)"
BACKEND_IMAGE="$(docker build -q -f docker/php/Dockerfile.platform .)"
docker run --rm \
  -v "$ROOT/backend:/var/www/html" \
  -w /var/www/html \
  -e APP_ENV=testing \
  -e DB_CONNECTION=sqlite \
  -e DB_DATABASE=':memory:' \
  -e CACHE_STORE=array \
  -e SESSION_DRIVER=array \
  -e QUEUE_CONNECTION=sync \
  "$BACKEND_IMAGE" \
  php artisan test

echo "==> Docker: aaPanel stack build (no start)"
docker compose -f docker-compose.aapanel.yml build

echo "==> All checks passed."
