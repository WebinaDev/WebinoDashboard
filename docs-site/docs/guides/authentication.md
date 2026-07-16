# Authentication

Dashboard SPA auth uses **Laravel Sanctum** with an **HttpOnly cookie** (`webino_auth_token`). Prefer `credentials: 'include'` from browser clients; do not store access tokens in `localStorage`.

## Login

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "secret",
  "otp": "123456"
}
```

Successful responses set `Set-Cookie: webino_auth_token=...; HttpOnly`. Optional TOTP (`otp` / `recovery_code`) when 2FA is enabled.

## Refresh / logout

```http
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
```

Both rotate or clear the cookie and the current Sanctum personal access token.

## Gate / check

```http
GET /api/v1/auth/gate
GET /api/v1/auth/check
```

Use these for bootstrapping the Next shell without reading the cookie from JavaScript.
