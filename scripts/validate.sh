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
if grep -q 'i18n/request' frontend/next.config.mjs 2>/dev/null; then
  fail "next.config.mjs must not reference i18n/request.ts (breaks Docker standalone)"
fi
ok "next.config.mjs OK"

for stale in frontend/i18n/request.ts frontend/src/i18n/request.ts; do
  [[ ! -f "$stale" ]] || fail "Remove $stale — use frontend/src/lib/server-translations.ts instead"
done
ok "no stale next-intl request config"

[[ -f frontend/src/lib/server-translations.ts ]] || fail "Missing frontend/src/lib/server-translations.ts"
if grep -R --include='*.ts' --include='*.tsx' -nE 'from ["'\''"]next-intl/server["'\''"]' frontend/src frontend/modules 2>/dev/null; then
  fail "Do not import next-intl/server — use @/lib/server-translations"
fi
ok "no next-intl/server imports"

layout="frontend/src/app/layout.tsx"
if ! grep -q 'timeZone=' "$layout" || ! grep -q 'now=' "$layout" || ! grep -q 'locale=' "$layout" || ! grep -q 'messages=' "$layout"; then
  fail "layout.tsx NextIntlClientProvider must pass locale, messages, now, timeZone (avoids next-intl/config in Docker)"
fi
ok "NextIntlClientProvider passes locale/messages/now/timeZone"

python3 <<'PY' || fail "next-intl hooks used in Server Components (add \"use client\" or getServerTranslations)"
import os
import re
import sys

ROOT = "frontend"
HOOKS = re.compile(r"\b(useTranslations|useLocale|useFormatter|useNow|useTimeZone|useMessages)\s*\(")
IMPORT = re.compile(r"""from ['"]next-intl['"]""")
issues = []

for base in (os.path.join(ROOT, "src"), os.path.join(ROOT, "modules")):
    if not os.path.isdir(base):
        continue
    for dirpath, _, files in os.walk(base):
        if "node_modules" in dirpath or ".next" in dirpath:
            continue
        for name in files:
            if not name.endswith((".ts", ".tsx")):
                continue
            path = os.path.join(dirpath, name)
            rel = path.replace("\\", "/")
            if rel.endswith("src/app/layout.tsx"):
                continue
            try:
                text = open(path, encoding="utf-8").read()
            except OSError:
                continue
            if not IMPORT.search(text) or not HOOKS.search(text):
                continue
            head = "\n".join(text.splitlines()[:40])
            if re.search(r"""^['"]use client['"]""", head, re.M):
                continue
            issues.append(rel)

if issues:
    for path in sorted(issues):
        print(f"  {path}", file=sys.stderr)
    sys.exit(1)
PY
ok "no next-intl hooks in Server Components"

if grep -q 'messages/fa.json' docker/next/Dockerfile 2>/dev/null; then
  fail "docker/next/Dockerfile must not COPY messages/ into runner (bundled via static import)"
fi
ok "Dockerfile runner does not rely on loose messages/"

[[ -f packages/webina-ui/dist/index.js ]] || fail "Run: cd packages/webina-ui && npm install && npm run build"
ok "webina-ui dist present"

ok "All pre-flight checks passed."
