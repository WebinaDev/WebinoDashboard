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

if grep -q 'pageExtensions' frontend/next.config.mjs 2>/dev/null; then
  fail "pageExtensions in next.config.mjs breaks App Router page.tsx files"
fi
ok "next.config.mjs OK"

[[ -f frontend/i18n/request.ts ]] || fail "Missing frontend/i18n/request.ts (next-intl)"
ok "next-intl request config present"

[[ -f packages/webina-ui/dist/index.js ]] || fail "Run: cd packages/webina-ui && npm install && npm run build"
ok "webina-ui dist present"

ok "All pre-flight checks passed."
