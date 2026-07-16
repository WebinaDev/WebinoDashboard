# Getting Started

**Webino Dashboard** is a multi-tenant storefront + admin product (Laravel API + Next.js).

## Live OpenAPI

```http
GET /api/v1/openapi.json
```

Export a committed snapshot for docs and CI:

```bash
cd backend
composer openapi
# → storage/app/openapi.json

cd ../docs-site
npm run sync:openapi
npm start
```

| Surface | Default URL |
|---------|-------------|
| Next app | `http://localhost:3000` |
| API (Caddy/compose) | `http://localhost/api/v1` |
| Docs (this site) | `http://localhost:3091` |
| Redoc explorer | `http://localhost:3091/api/explorer/` |

## Stack snapshot

- Laravel 13 + Sanctum (+ HttpOnly cookie `webino_auth_token`)
- Next.js 14 + next-intl (fa/en)
- Scramble OpenAPI → Docusaurus + redocusaurus
