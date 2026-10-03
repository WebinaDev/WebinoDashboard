# ERP staff impersonation

Contract for WebinoERP (issuer) and WebinoDashboard (this app). Support staff open a customer site without a password. The dashboard shows a persistent status bar, a one-click site switcher, and links into the page builder and theme builder.

## Shared secret

| Env | Role |
| --- | --- |
| `WEBINO_STAFF_IMPERSONATION_SECRET` | HMAC-SHA256 key. Must match on ERP and every dashboard. Preferred. |
| `WEBINO_PROVISION_HMAC_SECRET` | Used only when the dedicated secret is empty. |
| `WEBINO_STAFF_IMPERSONATION_TTL` | Max token lifetime in seconds. Default `600`, hard cap `900`. |
| `WEBINO_STAFF_IMPERSONATION_SESSION_MINUTES` | Dashboard session after exchange. Default `480`, cap `720`. |
| `WEBINO_ERP_BASE_URL` | Optional. Origin allowed for `sites_url` refresh and switch minting. |
| `WEBINO_ERP_API_TOKEN` | Bearer token the dashboard sends when it calls ERP. |

The raw ERP token is never stored in `localStorage`. Exchange sets the existing HttpOnly `webino_auth_token` cookie and deletes the transport cookie.

## Magic login

ERP sends the browser to the **target site**:

```text
https://{domain}/login?impersonate_token={token}
```

Or it sets cookie `webino_staff_impersonate={token}` (path `/`, not encrypted by Laravel — the name is in the encrypt exception list) and redirects to `/login`. The dashboard then calls:

```http
POST /api/v1/auth/impersonate
Content-Type: application/json
Accept: application/json
X-Requested-With: XMLHttpRequest

{ "token": "<jwt>" }
```

Omit `token` to read the cookie. Success matches a normal login (`Set-Cookie: webino_auth_token`) plus `impersonation` in the body. `password_must_change` is always false for this session, and the shell does not force the setup wizard or the customer’s 2FA.

The token is one-time. A second POST within 90 seconds (double-click or a retried request) returns the same session. After that the `jti` is rejected.

There is no password, OTP, or panel-user flow on this route.

## Token

Compact JWT, three base64url segments (no padding):

```text
base64url({"alg":"HS256","typ":"JWT"})
  . base64url(json_claims)
  . base64url(HMAC_SHA256(header_segment + "." + payload_segment, secret))
```

`alg` must be `HS256`. The dashboard always verifies HMAC-SHA256 and ignores any other algorithm. Clock skew is 30 seconds. `exp - iat` must be ≤ `WEBINO_STAFF_IMPERSONATION_TTL`.

### Claims

| Claim | Required | Notes |
| --- | --- | --- |
| `staff_id` | yes | string or int, max 64, `[A-Za-z0-9_.:-]` |
| `staff_name` | yes | shown in the bar |
| `site_id` | yes | ERP site id for **this** dashboard |
| `domain` | yes | must match this install’s tenant domain (or the request host on a single-tenant box whose stored domain is empty/`localhost`) |
| `customer` | yes | `{ "id", "name", "email"? }` or a plain name string |
| `sites` | yes | array, may be empty; max 100. Current site is inserted when missing |
| `iat`, `exp` | yes | unix seconds |
| `jti` | yes | 8–128 chars, `[A-Za-z0-9_-]` |
| `site_name` | no | label in the bar; falls back to the matching `sites[]` entry, then the domain |
| `return_url` | no | absolute http(s) URL used by **Back to ERP**. No userinfo |
| `sites_url` | no | absolute http(s) URL on `WEBINO_ERP_BASE_URL` |
| `aud` | no | if set, must be `webinodashboard` (string or array) |
| `iss` | no | if set, must be `webino-erp` |

`sites[]` item:

```json
{
  "site_id": "1002",
  "name": "سایت دوم",
  "domain": "two.example.com",
  "customer": { "id": "8", "name": "مشتری ۲" },
  "switch_url": "https://two.example.com/login?impersonate_token=ANOTHER_SHORT_LIVED_TOKEN"
}
```

`switch_url` is optional. When present it must be `https` (or `http` on `localhost` / `127.0.0.1`), host equal to that item’s `domain`, and path `/login`. Anything else is dropped. The dashboard does **not** return `switch_url` to the browser until the staff member clicks that site.

Example payload:

```json
{
  "iss": "webino-erp",
  "aud": "webinodashboard",
  "jti": "8f3c1c0e-6b2a-4d1e-9a77-0c1b2a3d4e5f",
  "iat": 1710000000,
  "exp": 1710000300,
  "staff_id": "42",
  "staff_name": "علی رضایی",
  "site_id": "1001",
  "site_name": "فروشگاه نمونه",
  "domain": "shop.example.com",
  "customer": { "id": "7", "name": "شرکت نمونه", "email": "owner@example.com" },
  "return_url": "https://erp.example.com/admin/sites",
  "sites_url": "https://erp.example.com/api/v1/staff-impersonation/sites",
  "sites": []
}
```

## Dashboard APIs (after exchange)

All require the staff Sanctum cookie or `Authorization: Bearer`.

```http
GET /api/v1/auth/impersonation
GET /api/v1/auth/impersonation?refresh=1
POST /api/v1/auth/impersonation/switch
{ "site_id": "1002" }
POST /api/v1/auth/impersonation/exit
```

`GET` returns `{ "active": false }` or:

```json
{
  "active": true,
  "staff_id": "42",
  "staff_name": "علی رضایی",
  "site_id": "1001",
  "site_name": "فروشگاه نمونه",
  "domain": "shop.example.com",
  "customer": { "id": "7", "name": "شرکت نمونه" },
  "sites": [
    { "site_id": "1001", "name": "فروشگاه نمونه", "domain": "shop.example.com", "customer": null, "current": true }
  ]
}
```

The same object is embedded on `GET /api/v1/auth/user` as `impersonation` (`null` for a normal session). `GET /api/v1/auth/gate` adds `staff_impersonation: true` and forces `password_must_change: false`.

`POST switch` responds `{ "switch_url": "https://two.example.com/login?impersonate_token=..." }`. The UI navigates there. Resolution order:

1. `switch_url` stored from the signed token (host must match the site domain).
2. Otherwise `POST {WEBINO_ERP_BASE_URL}/api/v1/staff-impersonation/switch` with `Authorization: Bearer {WEBINO_ERP_API_TOKEN}` and body `{ "staff_id", "site_id", "domain" }`. Response `data.switch_url` (or top-level `switch_url`) is checked the same way. Redirects are not followed.

`?refresh=1` GETs `sites_url` with the same bearer token when that URL’s scheme and host equal `WEBINO_ERP_BASE_URL`. Expected body: `{ "data": { "sites": [ ... ] } }` or `{ "sites": [ ... ] }`. Private and link-local hosts are refused outside `local` / `testing`.

`POST exit` deletes the Sanctum token and returns `{ "return_url": "..." }`. The bar sends the browser there, or to `/login` when it is missing.

## UI

While `impersonation.active` is true, a bar sits above the dashboard header (and above the setup wizard and the fullscreen builder). Persian copy lives in `frontend/messages/fa.json` under `impersonation`:

- staff name, current site name, domain, customer name
- **سایت‌های دیگر** — one click per other site
- **صفحه‌ساز** → `/dashboard/builder`
- **قالب‌ساز** → `/dashboard/themes`
- **بازگشت به ERP** → exit

## Error codes

`errors.code` on failure:

| Code | HTTP |
| --- | --- |
| `IMPERSONATION_INVALID` | 401 |
| `IMPERSONATION_EXPIRED` | 401 |
| `IMPERSONATION_REPLAY` | 401 |
| `IMPERSONATION_SITE_MISMATCH` | 403 |
| `IMPERSONATION_NOT_ACTIVE` | 403 |
| `IMPERSONATION_UNAVAILABLE` | 503 when the secret is missing, 422 when the site has no staff user |
| `IMPERSONATION_SWITCH_UNAVAILABLE` | 422 |
| `IMPERSONATION_CURRENT_SITE` | 422 |
