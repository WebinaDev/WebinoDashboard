# شروع کار

**Webino Dashboard** محصول مالتی‌تننت فروشگاه و داشبورد ادمین است (Laravel + Next.js).

## OpenAPI زنده

```http
GET /api/v1/openapi.json
```

```bash
cd backend && composer openapi
cd ../docs-site && npm run sync:openapi && npm start
```

کاوشگر Redoc: `/api/explorer/`
