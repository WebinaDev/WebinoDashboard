# Ops helpers for WebinoDashboard (consumer site).
# Prefer docker compose; mirrors a lightweight install.sh migrate step without ERP orchestration.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "Migrating backend inside compose service 'backend'…"
docker compose exec backend php artisan migrate --force
echo "Done. Health: curl -sS http://127.0.0.1:${WEB_HTTP_PORT:-3080}/api/v1/health/metrics"
