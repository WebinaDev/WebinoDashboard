# OpenAPI regenerate

Docker/PHP CLI were unavailable in the audit-fix environment (`scramble:export` could not run).

When PHP or Compose is available:

```bash
cd WebinoDashboard/backend
composer export-openapi
# or: php artisan scramble:export --path=storage/app/openapi.json

cd ../docs-site
npm run sync:openapi
```

Goal: docs OpenAPI path count should track live `/api/v1` routes (not the older ~75-path snapshot).
