# Marketing, bots, and SMS panel

This guide covers the marketing port: coupons, Bale/Telegram bots (settings, sessions, broadcast, campaigns), and the ModirPayamak SMS panel proxy.

## Modules

| Module | Submodules | Notes |
|--------|------------|--------|
| `marketing` | `coupons`, `bot-broadcast`, `bot-campaigns`, `sms`, `newsletter` | Admin under `/admin/marketing/*` |
| `bots` | `bale`, `telegram` | Token settings at `/admin/bots/bale` and `/admin/bots/telegram` |
| `sms-panel` | `panel` | Gates `/api/v1/modirpayamak/*` proxy |

Site profiles: ecommerce, cafe, and corporate activate coupons + bots + SMS. Magazine keeps newsletter only.

## Coupons

- CRUD: `GET|POST /api/v1/marketing/coupons`, `GET|PUT|DELETE /api/v1/marketing/coupons/{id}`
- Helpers: `GET …/generate-code`, `POST …/preview`, `POST …/bulk`
- Restrictions JSON includes `channels` (`site|bale|telegram`), product/category/brand IDs, emails
- Checkout: `POST /api/v1/checkout` with `coupon_code` (+ optional `channel`) applies discount and records redemption
- Admin composer/POS orders accept `coupon_code` via `OrderWriter`

## Bots

- Settings: `GET|PUT /api/v1/bots/{bale|telegram}/settings`
- Sessions: `GET …/sessions`
- Test send: `POST …/send`
- Public webhook: `POST /api/v1/public/bots/{provider}/webhook?secret=…` (registers `bot_sessions`)
- Broadcast: `GET …/broadcast`, `POST …/broadcast/start|cancel` — queued via `ProcessBroadcastJob` (poll UI ~4s)
- Campaigns: `GET|POST …/campaigns`, CSV import `POST …/users/import`

Providers call `tapi.bale.ai` / `api.telegram.org`.

## SMS (ModirPayamak)

Authenticated catch-all:

`GET|POST /api/v1/modirpayamak/{path}`

Proxies to `{WEBINO_BASE_URL}/api/webinocrm/v1/modirpayamak/{path}` with tenant `domain` and `license_key`. CRM failures return `{ ok: false, unavailable: true, message }` with HTTP 200 (parity with WordPress).

**Live admin UI:** home, send, reports, inbox, phonebook, patterns (list), secretaries, wallet, lines, topup.  
**Deferred (routes hidden from nav):** drafts, newsletter, OTP, pattern sync/registry, scheduled cancel, targeted, bulk-stats.

Admin pages under `/admin/marketing/sms/*` only for live routes above. This is **not** full WordPress SMS parity.

## UI parity

Admin marketing UI is adapted from the WordPress WebinaDashboard client (not a separate Vite iframe):

- **Theme:** Admin shell uses WP-like colorful cream/teal tokens, `wd-app-atmosphere`, business accents (`cafe`, `cosmetics`, `mobile`, `electronics`, …), and **Yekan Bakh**.
- **Shared:** `PageShell`, `ListStatsStrip`, coupon panels, `SmsServiceBanner`, bot provider switcher.
- **Coupons:** List (stats, filters, bulk, table) and editor map to Laravel `restrictions` JSON and `*_minor` fields.
- **SMS:** Partial panel — live routes listed above; unavailable CRM paths are gated/hidden rather than shown as empty “full panel” pages. `SmsServiceBanner` when proxy returns `unavailable`.
- **Bots:** Broadcast and campaigns panels with provider switcher; Bale/Telegram settings cover token, webhook URL, and test send. Advanced WP-only site-widget/admin-ops UIs stay hidden when no API exists.

Visual acceptance: compare light/dark + accents against WP for coupons list/editor, SMS send/dashboard, and bot broadcast.

## Ops

```bash
php artisan migrate
php artisan queue:work   # for broadcast ticks
php artisan test --filter=MarketingBotsSmsApiTest
```

Ensure `services.webino.base_url` and tenant license/domain are set for live SMS.
