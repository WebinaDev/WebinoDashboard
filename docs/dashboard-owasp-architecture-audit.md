# WebinoDashboard — OWASP + Architecture Audit

> **r2:** open items after `2f6eba5` are in [`dashboard-owasp-architecture-audit-r2.md`](dashboard-owasp-architecture-audit-r2.md) (2026-10-03). This file stays the r1 record. The Fixed rows here were re-checked and still hold unless r2 says otherwise.


**Scope:** local repo `/mnt/Mine/Projects/Webina/Webina/Plugins/Webina/WebinoDashboard`  
**Base HEAD audited:** `33de06a320b0605aeb7e211d48f45dce1ae361c6` (`merge: land Iranian payment gateways onto reaudit main`)  
**Prior reaudit:** `docs/dashboard-full-reaudit.md` (all C/H/M/L marked Fixed there)  
**Method:** deep grep + file reads of `backend/` + `frontend/`; no invented findings; every open item cites paths.  
**Out of scope:** live exploit PoCs, pushing remotes, inventing CVEs without code evidence.

Severities: **critical** / **high** / **medium** / **low**.

---

## Executive summary

| Severity | Open (this audit) | Fixed in this pass | Still Fixed (prior reaudit) |
| --- | ---: | --- | --- |
| critical | **0** | — | C1, C2 |
| high | **0** | A-H1, A-H2 | H1–H9 |
| medium | **0** | A-M1–A-M5 | M1–M10 |
| low | **0** | A-L1–A-L6 | L1–L4 |

Prior security reaudit + Iranian gateway binding (**H3** / callback authority) still hold. The open items from this audit (A-H1–A-H2, A-M1–A-M5, A-L1–A-L6) are **Fixed** in the follow-up commit: Digikala webhooks require a secret, C2C settings and setup mutations are capability-gated, marketplace `mark_paid` is not forwarded, public cafe/checkout writes are throttled, Modir paths reject `..`, and staff `orders.own` cannot set line prices. No new payment-callback “authority unbound” or wallet-staff-debit regressions found.

**Iranian commerce gateways in tree:** `zarinpal`, `digipay`, `snapppay`, `torobpay` (+ hub toggles for `bale_pay`, `basalam_pay`, `wallet`, `c2c`, `cod`). Callbacks require intent-bound tokens; ERP platform billing never marks paid from the browser return URL.

---

## OWASP Top 10 (2021) matrix

| OWASP | Result | Finding IDs / notes |
| --- | --- | --- |
| A01 Broken Access Control | **Pass** | **A-H2**, **A-M1**, **A-L1**, **A-L4** Fixed. Prior **H1/H7/C1** still Fixed (`OrderAccess`, `can:` on updates/modules/bots). |
| A02 Cryptographic Failures | **Pass** | Coupon passwords hashed (`Coupon` mutator + `password_verify`); gateway secrets masked via `SECRET_KEYS` / `has_*` (`PaymentGatewaySettingsService::getPublic`); bot settings return `has_webhook_secret`. |
| A03 Injection | **Pass** (no evidence of raw SQL concatenation of user input in audited paths); Eloquent/`whereKey` dominant. Modir path `..` is **A10-adjacent**, not classic SQLi. |
| A04 Insecure Design | **Pass** | **A-M2**, **A-M3**, **A-M5** Fixed. Checkout/guest pricing SoT still `storefrontPriceMinor` / `PurchaseTypeService::unitPrice`. |
| A05 Security Misconfiguration | **Pass** | Health readiness ok/fail only; metrics token-gated (**M5** still Fixed). Digikala HMAC required when enabled (**A-H1** Fixed). Docker sample passwords documented (**L4** Fixed). |
| A06 Vulnerable Components | **Partial / unproven** | Laravel `v13.20.0`, Sanctum `v4.3.2` in lockfile. No `composer audit` run in this pass; no known-exploited package callouts from code review alone. |
| A07 Identification & Authentication Failures | **Pass** | Login/OTP throttled `5,1`; impersonation blocks security changes; 2FA endpoints call `blockSecurityChanges`. |
| A08 Software & Data Integrity | **Pass** | Payment verify-before-paid holds (**H3**). Digikala unsigned bodies rejected (**A-H1** Fixed). Marketplace `mark_paid` stripped (**A-M2** Fixed). Digipay `providerId` required (**A-L5** Fixed). |
| A09 Security Logging & Monitoring Failures | **Pass / partial** | Marketplace + bot webhook failures logged; `site.system-logs` tail gated by `settings.manage`. No finding that payment failures are silent. |
| A10 SSRF | **Pass** | Maps search uses fixed Neshan/Mapbox hosts (**no user URL**). **A-M4** Fixed: Modir paths reject `..` and non-allow-listed segments. |
| CSRF / Sanctum | **Pass** | `SESSION_SAME_SITE=lax`; `RequireAjaxHeader` on cookie mutating APIs; public webhooks/callbacks exempt by design. |
| IDOR | **Pass** | Staff orders scoped by `tenant_id` + `OrderAccess`; public pay-link requires `pay_token`. C2C settings require `settings.manage` or `commerce.*` (**A-H2** Fixed). Payment callbacks on a public host are tenant-scoped (**A-L4** Fixed). |
| XSS (builder HTML) | **Pass** | DOMPurify allow-list in `widgets.tsx`; chart colors hex/name-only (**L2** Fixed). |
| Multi-tenant isolation | **Pass** (audited surfaces) | Controllers consistently `where('tenant_id', …)`; bot webhook selects by `webhook_secret` (**C2** Fixed). Payment `Order $order` binding is global ID but paid/fail still intent-bound (**A-L4**). |

---

## Architecture checklist

| Check | Status | Evidence |
| --- | --- | --- |
| Single pricing source of truth (storefront) | **Pass** | `Product::storefrontPriceMinor`; checkout + guest cart use `PurchaseTypeService::unitPrice` / `storefrontPriceMinor`. Staff `OrderWriter` may override `unit_price_minor` (see **A-M5**). |
| Page-builder vs hardcoded storefront | **Pass (hybrid by design)** | `(site)/layout.tsx` prefers published builder header/footer/`StorefrontDocument`, else theme `SiteHeader`/`SiteFooter`. Themes under `frontend/src/themes/*` remain fallbacks. |
| FA/EN locale messages | **Pass** | **A-L3** Fixed: FA mirrors for `common.edit` and `tickets.csat_*`. Empty gateway/billing copy is no longer bare «ندارد». |
| Persian digits / Jalali / breadcrumb | **Pass (admin)** | `frontend/src/lib/locale.ts` Jalali + `toLocaleDigits` for `fa`; M10 still Fixed. Public cafe reservations still `datetime-local` (documented exception). |
| Hardcoded user-facing strings | **Pass** | **A-L2** Fixed: add-to-cart and API error map use `messages/{fa,en}.json`; C2C default title uses `c2c.default_title`. |
| Nav vs API capabilities | **Pass** | **A-H2** Fixed: C2C settings nav and API use `settings.manage` or `commerce.*`. Receipts stay on `orders.own`. |
| Module patterns | **Pass** | Kernel manifests + `module:` / `public.module:` middleware; external modules dirs present. |
| Duplicate routes / aliases | **Pass** | **A-L6** Fixed: `/products/bulk-sale` and `/…/settings` aliases 307/302 to the canonical paths. |
| ERP platform billing integrity | **Pass** | `TenantBillingController`: browser return never sets paid; status from ERP/stub only; stub autopay only if `WEBINO_ERP_BILLING_STUB_AUTOPAY`. |

---

## Findings

Status after the fix pass: **all rows Fixed**.

| ID | Status | Note |
| --- | --- | --- |
| **A-H1** | Fixed | Webhook 403 when the secret is empty or the HMAC mismatches. Enabling Digikala without `webhook_secret` is 422. Admin hub will not toggle Digikala on while `has_webhook_secret` is false. |
| **A-H2** | Fixed | `GET/PUT /c2c/settings` require `settings.manage` or `commerce.*`. Receipts and decide stay on `orders.*` / `orders.own`. Nav capability matches. |
| **A-M1** | Fixed | Setup mutations (including license sync) require `settings.manage` or `system.manage`. `GET /setup/status` stays readable for staff. |
| **A-M2** | Fixed | Client `mark_paid` / `pay` are not forwarded. The server requests a payment session itself. Local `licensed` updates only when ERP returns a license object. |
| **A-M3** | Fixed | Public consultations, cafe reservations, event bookings, phone register, cart items, and checkout use the `public-writes` limiter (per IP+host and per tenant). |
| **A-M4** | Fixed | Modir paths are decoded, then rejected on `..`, null bytes, or characters outside `[A-Za-z0-9_/-]`. |
| **A-M5** | Fixed | Client `unit_price_minor` is ignored unless the user has `orders.*` or is calling `/pos/orders` with `pos.use`. Otherwise the line uses storefront or purchase-type price. |
| **A-L1** | Fixed | `GET /inventory/summary` requires `catalog.*` or `reports.shop`. |
| **A-L2** | Fixed | Add-to-cart and API status copy live in `messages/{fa,en}.json`. C2C default title is translated. |
| **A-L3** | Fixed | FA keys added for `common.edit` and `tickets.csat_*`. Empty states for gateways and platform billing are full sentences. |
| **A-L4** | Fixed | On a public host, the payment callback order must belong to the tenant for that host. Unknown hosts and cross-tenant ids redirect as failed without revealing paid state. |
| **A-L5** | Fixed | Digipay callback requires `providerId` and matches it to the stored intent. No latest-intent fallback. |
| **A-L6** | Fixed | Canonical bulk sale is `POST /shop/products/bulk-sale`. `POST /products/bulk-sale` is a 307. Per-gateway `/…/settings` aliases redirect to `/payments/gateways/{provider}`. |

## Findings (detail, now fixed)


| ID | Severity | Area | OWASP | Evidence | Impact | Recommended fix |
| --- | --- | --- | --- | --- | --- | --- |
| **A-H1** | high (Fixed) | marketplace / webhooks | A05 / A08 | `MarketplaceWebhookController::digikala` — HMAC checked **only if** `webhook_secret !== ''`; otherwise `DigikalaWebhooks::dispatch` runs for an enabled platform. Route is public under `public.tenant`. | Attacker who can hit the tenant host can forge Digikala events (order/status jobs) when the merchant left secret empty. | Require non-empty secret when Digikala is enabled; reject unsigned bodies with 403; surface `has_webhook_secret` in admin and block enable without secret. |
| **A-H2** | high | payments / C2C / authz | A01 | `routes/api.php` `module:c2c` group: `PUT /c2c/settings` behind `can:orders.*,orders.own`. `C2cController::updateSettings` writes tenant IBAN/cards with no extra cap. Nav `settings/c2c` also `capability: "orders.own"` (`commerce/manifest.ts`). | Any seller (`orders.own`) can change settlement cards/IBAN for the whole tenant. | Gate settings read/write with `settings.manage` or `commerce.*`; keep receipts/decide on `orders.*` / `orders.own`. Align nav capability. |
| **A-M1** | medium | setup / authz | A01 | Under `middleware('staff')` without `can:`: `POST /setup/apply-site-type`, `PATCH /setup/store`, `PATCH /setup/crm`, `POST /setup/complete` (`routes/api.php`). `EnsureStaffRole::ROLES` includes `author`, `editor`, `seller`, `accountant`. | Weak staff roles can switch site type / mark setup complete / rewrite store CRM fields. | Require `settings.manage` or `system.manage` (or admin-only) for mutating setup; leave `GET /setup/status` readable. |
| **A-M2** | medium | modules / integrity | A04 / A08 | `ModuleMarketplaceController::purchase` validates `mark_paid` and forwards the full payload via `WebinoMarketplaceClient::purchase` to ERP. | If ERP honors client `mark_paid`, staff could license modules without payment. Risk is ERP-side; dashboard still forwards the flag. | Strip `mark_paid` / `pay` from client input; only ERP/webhook may grant; keep local `licensed` updates only when ERP returns a license object after real payment. |
| **A-M3** | medium | cafe / public API | A04 / A05 | Public `POST /cafe/cart/items`, `/cafe/checkout`, `/cafe/reservations`, `/cafe/phone-register`, `/consultations` have **no** `throttle:` (unlike auth `5,1` and analytics `180,1`). | Abuse: spam orders/reservations/OTP-adjacent phone gate; stock contention noise. | Add per-IP (and per-tenant) throttles; consider CAPTCHA on reservation/consultation. |
| **A-M4** | medium | SMS proxy / SSRF-adjacent | A10 | `ModirPayamakClient::url` prefixes `modirpayamak/` but does **not** reject `..` — e.g. path `../../other` becomes `…/api/webinocrm/v1/modirpayamak/../../other` (normalized by HTTP stack). | Authenticated `marketing.*` user may hit unintended ERP CRM paths on the configured host. | Allow-list path segments (`^[a-z0-9_/-]+$`), reject `..`, and map to fixed ERP operations only. |
| **A-M5** | medium | orders / pricing | A04 | `OrderController` validates `items.*.unit_price_minor`; `OrderWriter::buildItems` prefers client unit price over `storefrontPriceMinor` when set. Available to `orders.own`. | Sellers can create/rewrite orders at arbitrary line prices (undercharge). POS may need override — customers/checkout do not. | Ignore client prices unless `orders.*` or `pos.use`; otherwise force storefront/purchase-type price. |
| **A-L1** | low | inventory / authz | A01 | `GET /inventory/summary` — `module:inventory` only, no `can:` (`routes/api.php`, `InventoryController`). | Any staff role sees low/out-of-stock lists. | Add `can:catalog.*` or `reports.shop`. |
| **A-L2** | low | i18n / content | — | Hardcoded FA: `frontend/src/builder/render/widgets.tsx` (`افزودن به سبد`), `frontend/src/lib/api-helpers.ts` status map, `C2cController::defaultSettings` title `کارت به کارت`. | EN UI still shows FA fragments; message catalogs bypassed. | Move to `messages/{fa,en}.json` + `useTranslations`. |
| **A-L3** | low | i18n | — | EN-only keys: `common.edit`, `tickets.csat_*`. Empty strings `commerce_gateways.empty` / `platform_billing.empty` = «ندارد». | Missing FA keys for 3 EN entries; sparse empty copy. | Add FA mirrors; replace bare «ندارد» with fuller empty-state copy where UX needs it. |
| **A-L4** | low | payments callback | A01 | `GET /payments/callback/{provider}/{order}` binds `Order` by global id (`whereNumber` only). Paid/fail still require intent match (`intentMatching` / verify). | Cross-tenant ID oracle / odd redirects; **not** a free paid mark after H3. | Scope binding with tenant from intent/host or opaque pay slug. |
| **A-L5** | low | digipay callback | A08 | `handleDigipay`: empty `providerId` falls back to `latestIntent($order,'digipay')`, then verify uses stored `provider_id`. | Slightly weaker request binding than zarinpal authority; verify API still required. | Require `providerId` always (same as authority). |
| **A-L6** | low | architecture | — | Duplicate `BulkSaleController` routes; per-gateway settings aliases alongside `/payments/gateways/{provider}`. | Maintenance drift risk only. | Prefer one canonical path; keep aliases as thin redirects. |

---

## Still Fixed from `docs/dashboard-full-reaudit.md`

Re-checked at `33de06a` — **none reopened**:

| Prior ID | Spot-check evidence |
| --- | --- |
| C1 | `OrderController` rejects staff wallet tender change (`rejectStaffWalletTender`); `WalletCheckout` requires `meta.wallet_checkout`. |
| C2 | `BotController::webhook` requires non-empty secret + matching `BotSetting`; settings expose `has_webhook_secret`. |
| H1 | `OrderAccess::scopeOwned` on index/find/bulk/returns/c2c. |
| H2 | `C2cController::decide` requires card_to_card + confirmable statuses. |
| H3 | `PaymentCallbackController` `intentMatching` + nonce/`stateAllows`; bare GET does not fail order. |
| H4 | `CheckoutController` invalid `shipping_instance_id` → 422; body `shipping_minor` only when no rates. |
| H5/H6 | `OrderStock` `lockForUpdate` + stock≥qty; lifecycle restores on leaving sale statuses. |
| H7 | Core update / module install / themes / bots / sms / variants behind `can:`. |
| H8 | `UserAdminService` wallet via `WalletService::adjust`; admin role assign admin-only. |
| H9 | Returns refund in transaction + `lockForUpdate`; unique credit path. |
| M1 | Guest checkout re-checks `is_sold_out` + `assertLinesAvailable`. |
| M2 | `releaseBeforeDelete` before trash/delete. |
| M3 | `analytics/summary` `can:reports.shop,orders.*`. |
| M4 | Nav caps largely aligned (exception: A-H2 C2C settings). |
| M5 | Health readiness ok/fail; metrics token 404. |
| M6–M9 | Migrations/coupons/stats/storefront scope as documented. |
| M10 | Admin Jalali/`LocaleDatePicker`/RTL breadcrumb. |
| L1–L4 | Coupon hash; DOMPurify; SameSite lax; deploy docs warn on sample secrets. |

Also still true from prior “intentionally verified” list: customer wallet topup 422; provision HMAC empty → 503; coffee `site_type:coffee`; trash `guardPublish`; ticket account redirect.

---

## Suggested fix order

1. **A-H2** C2C settings capability (small, high leverage).  
2. **A-H1** Digikala require webhook secret.  
3. **A-M1** setup `can:settings.manage`.  
4. **A-M2** strip `mark_paid` from marketplace purchase body.  
5. **A-M3** / **A-M4** / **A-M5** rate limits, Modir allow-list, staff price authority.

---

## Audit metadata

- Branch intended for this doc: `audit/owasp-architecture-local`  
- Do **not** push (per task).  
- Authoring time (Asia/Tehran): 2026-10-03 ~20:56 +0330  
