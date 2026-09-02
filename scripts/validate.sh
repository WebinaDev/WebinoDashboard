#!/usr/bin/env bash
# Pre-flight checks before Docker build / deploy.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail() { printf '\033[1;31m[validate]\033[0m %s\n' "$*" >&2; exit 1; }
ok() { printf '\033[1;32m[validate]\033[0m %s\n' "$*"; }

[[ -f docker-compose.aapanel.yml ]] || fail "Missing docker-compose.aapanel.yml"
[[ -f backend/.env.example ]] || fail "Missing backend/.env.example"
[[ -f frontend/package-lock.json ]] || fail "Missing frontend/package-lock.json"

for json in frontend/messages/fa.json frontend/messages/en.json; do
  python3 -c "import json; json.load(open('$json'))" || fail "Invalid JSON: $json"
done
ok "i18n JSON files valid"

if grep -q 'pageExtensions\|createNextIntlPlugin\|next-intl/plugin' frontend/next.config.mjs 2>/dev/null; then
  fail "next.config.mjs must not use pageExtensions or next-intl/plugin (breaks Docker standalone)"
fi
ok "next.config.mjs OK"

[[ -f frontend/src/lib/server-translations.ts ]] || fail "Missing frontend/src/lib/server-translations.ts"
if grep -R --include='*.ts' --include='*.tsx' -n 'from "next-intl/server"' frontend/src frontend/modules 2>/dev/null; then
  fail "Do not import next-intl/server — use @/lib/server-translations"
fi
ok "no next-intl/server imports"

[[ -f packages/webina-ui/dist/index.js ]] || fail "Run: cd packages/webina-ui && npm install && npm run build"
ok "webina-ui dist present"

ok "All pre-flight checks passed."
