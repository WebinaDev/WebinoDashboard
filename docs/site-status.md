# Site status (active / coming_soon / suspended)

Stored per tenant in `module_settings` (`settings` / `site.status`), service `App\Services\Site\SiteStatusService`.

## Platform API (WebinoERP control panel)

`GET /api/v1/provision/site-status` and `PUT /api/v1/provision/site-status`

Auth: identical to `/api/v1/provision/bootstrap`:
- `X-Provision-Token: <TENANT_PROVISION_TOKEN>` (site container env)
- `X-Provision-Signature: hex(hmac_sha256(raw_request_body, WEBINO_PROVISION_HMAC_SECRET))` — for GET the body is the empty string.
- 403 on bad token/signature, 503 if the HMAC secret is not configured.

PUT body (JSON):
```json
{"status":"active|coming_soon|suspended","reason":"license_expired","expires_at":"2026-10-01T00:00:00Z","launch_at":null,
 "renew_url":"https://webina.dev/...","support_url":"https://webina.dev/contact"}
```
`reason`, `expires_at`, `launch_at` optional (ISO 8601); `renew_url` / `support_url` optional extras shown on the suspended page.
Omitted `expires_at`/`launch_at` keep their previous value; `reason` is reset when omitted.

Response (both), inside the standard API envelope `{"success":true,"data":{...}}`:
```json
{"status":"suspended","reason":"license_expired","expires_at":"2026-10-01T00:00:00+00:00","launch_at":null,
 "updated_at":"2026-10-23T16:10:00+00:00","updated_by":"platform"}
```
The ERP pushes `suspended` on license expiry and `active` on renewal; the site does no local license checks.

## Site admin API
`GET|PUT /api/v1/site-status` (Sanctum, `settings.manage`). PUT `{status: active|coming_soon, launch_at?}`.
`suspended` is rejected (422); any change while platform-suspended returns 423.
UI: Dashboard → Settings → Site general → «وضعیت سایت».

## Public
`GET /api/v1/public/site-status` (no-store) and `site_status` in `/api/v1/public/tenant`.
Next middleware rewrites storefront routes to `/site-status/coming-soon` (200; logged-in users bypass) or
`/site-status/suspended` (503, `X-Robots-Tag: noindex`, everyone). `/dashboard`, `/login`, `/setup` are never blocked.
The coming-soon form posts to `/api/v1/public/newsletter/subscribe` with `source=coming_soon`.
