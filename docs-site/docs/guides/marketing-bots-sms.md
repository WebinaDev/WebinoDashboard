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

Admin pages: `/admin/marketing/sms` and child routes (send, reports, inbox, drafts, phonebook, scheduled, patterns, secretaries, wallet, lines, newsletter, topup, payment-callback).

## UI parity

Admin marketing UI is adapted 1:1 from the WordPress WebinaDashboard client (not a separate Vite iframe):

- **Theme:** Admin shell uses WP-like colorful cream/teal tokens, `wd-app-atmosphere`, business accents (`cafe`, `cosmetics`, `mobile`, `electronics`, …), and **Yekan Bakh**.
- **Shared:** `PageShell`, `ListStatsStrip`, coupon panels, `SmsServiceBanner`, bot provider switcher.
- **Coupons:** List (stats, filters, bulk, table) and editor (general / usage / restrictions / publish) map to Laravel `restrictions` JSON and `*_minor` fields.
- **SMS:** Full panel navigation + real forms/tables for dashboard, send (webservice/pattern/p2p), reports, inbox, drafts, phonebook, scheduled, patterns, secretaries, wallet, lines, newsletter, topup, payment callback. Unavailable CRM proxy shows `SmsServiceBanner`.
- **Bots:** Broadcast and campaigns panels with provider switcher; Bale/Telegram settings cover token, webhook URL, and test send. Advanced WP-only site-widget/admin-ops UIs stay hidden or “coming soon” when no API exists.

Visual acceptance: compare light/dark + accents against WP for coupons list/editor, SMS send/dashboard, and bot broadcast.

## Ops

```bash
php artisan migrate
php artisan queue:work   # for broadcast ticks
php artisan test --filter=MarketingBotsSmsApiTest
```

Ensure `services.webino.base_url` and tenant license/domain are set for live SMS.
