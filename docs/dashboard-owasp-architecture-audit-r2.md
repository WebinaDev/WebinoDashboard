# WebinoDashboard — OWASP + Architecture Re-audit (r2)

**Scope:** local repo `/mnt/Mine/Projects/Webina/Webina/Plugins/Webina/WebinoDashboard`  
**HEAD audited:** `2f6eba581d2adcbbab9ba975a05151e3ec81c715` (`fix(security): close open OWASP audit findings`)  
**Branch at audit:** `main` (clean before this doc; not pushed)  
**Prior:** `docs/dashboard-owasp-architecture-audit.md` (r1, base `33de06a`, items A-* closed in `2f6eba5`) and `docs/dashboard-full-reaudit.md` (C/H/M/L)  
**Method:** route map of `backend/routes/api.php` plus `marketplace_public.php`, then read of payment, order, stock, wallet, webhook, pricing, builder, and i18n paths. No exploit PoCs. Findings below are code that is still in the tree. PHPUnit was not re-run (`php` is not on PATH on this machine).  
**Out of scope:** pushing, Cursor cloud agents, inventing issues without a file citation.

Severities: **critical** / **high** / **medium** / **low**.

---

## Executive summary

The `2f6eba5` pass closed the r1 open set (A-H1–A-H2, A-M1–A-M5, A-L1–A-L6). Those controls are still present. Customer payment callbacks still verify a stored intent before `paid`. Wallet tender still cannot be switched on by staff. Digikala webhooks still 403 when the secret is empty.

This pass found **new** gaps the fix commit did not touch. None are unauthenticated payment forgeries. Two were high: staff order rewrite could desync stock and skip the status graph, and reference-price fetch would GET an arbitrary URL. Four mediums and four lows were access-control, SSR HTML, rate-limit trust, and leftover public writes.

**Resolution:** every open r2 finding below is **Fixed** in the working tree (not pushed). Evidence rows are unchanged so the original defect stays visible.

| Severity | Open (r2) | Fixed this pass | r1 A-* still Fixed | Prior reaudit still Fixed |
| --- | ---: | --- | --- | --- |
| critical | **0** | — | — | C1, C2 |
| high | **0** | R2-H1, R2-H2 | A-H1, A-H2 | H1–H9 |
| medium | **0** | R2-M1–R2-M4 | A-M1–A-M5 | M1–M10 |
| low | **0** | R2-L1–R2-L4 | A-L1–A-L6 | L1–L4 |

**Iranian gateways still in tree:** `zarinpal`, `digipay`, `snapppay`, `torobpay`, plus hub toggles for `bale_pay`, `basalam_pay`, `wallet`, `c2c`, `cod`. Callbacks stay intent-bound. ERP billing still does not mark paid from the browser return.

---

## OWASP Top 10 (2021) matrix

| OWASP | Result | Notes |
| --- | --- | --- |
| A01 Broken Access Control | **Pass** (R2-H1, R2-M2 Fixed) | **R2-H1** rewrite skips `OrderStatusService`. **R2-M2** AI and several content modules have no `can:`. Prior H1/H7/C1 and A-H2/A-M1/A-L1 still hold on the paths they named. |
| A02 Cryptographic Failures | **Pass** | Coupon password mutator, gateway `SECRET_KEYS`, bot `has_webhook_secret` unchanged. |
| A03 Injection | **Pass** (R2-M3 Fixed) | **R2-M3** builder HTML skips DOMPurify on the server. No new raw SQL concatenation of request input found. Chart colors stay hex/name-only. |
| A04 Insecure Design | **Pass** (R2-H1, R2-M1, R2-L1 Fixed) | **R2-H1** stock ledger keyed by deleted line ids. **R2-M1** `discount_minor` bypasses the A-M5 price strip. **R2-L1** a few public POSTs still have no limiter. |
| A05 Security Misconfiguration | **Pass / partial** | Health readiness and metrics token unchanged. **R2-M4** is proxy trust, not a default debug flag. Digikala still refuses an empty webhook secret (A-H1). |
| A06 Vulnerable Components | **Partial / unproven** | Lockfile not re-audited with `composer audit` (`php` missing). No new known-exploited callout from reading call sites. |
| A07 Identification & Authentication Failures | **Pass** (R2-M4 Fixed) | Login/OTP still `throttle:5,1`. **R2-M4** those limits key off `$request->ip()` while every proxy is trusted. |
| A08 Software & Data Integrity | **Pass** (R2-L2 Fixed) | Callback verify-before-paid holds (H3, A-L4, A-L5). **R2-L2** Digipay and BNPL still treat a missing verified amount as a match. Marketplace `mark_paid` is still stripped (A-M2). |
| A09 Security Logging & Monitoring Failures | **Pass / partial** | Same as r1: webhook failures logged; system log tail gated. No new silent payment success path. |
| A10 SSRF | **Pass** (R2-H2 Fixed) | **R2-H2** reference sync. Modir paths still reject `..` (A-M4). WordPress media fetch still uses `SafeRemoteFetcher` + `ImportUrlGuard`. Maps search still uses fixed Neshan/Mapbox hosts. |
| CSRF / Sanctum | **Pass** | `api/*` is CSRF-exempt by design. `RequireAjaxHeader` still demands `X-Requested-With` or a JSON `Accept` on cookie mutations. Public webhooks and callbacks stay exempt. |
| IDOR | **Pass** (audited) | Staff orders still `tenant_id` + `OrderAccess`. Pay links still need `pay_token`. Download `serve` still requires a valid signature and a sales status. |
| XSS (builder HTML) | **Pass** (R2-M3 Fixed) | **R2-M3**. DOMPurify allow-list runs only when `window` is defined. |
| Multi-tenant isolation | **Pass** (audited surfaces) | Guest cart and cafe like/feedback still compare `product.tenant_id` to the public tenant. Payment callback on a public host still scopes the order (A-L4). |

---

## Architecture checklist

| Check | Status | Evidence |
| --- | --- | --- |
| Single pricing source of truth (storefront) | **Partial** | Checkout and guest cart still price from `PurchaseTypeService::unitPrice` / `storefrontPriceMinor`. Staff catalog lines are stripped unless `orders.*` or POS (`OrderController::withoutUnauthorizedPrices`). **R2-M1** Fixed: `orders.own` no longer accepts client `discount_minor`. |
| Page-builder vs hardcoded storefront | **Pass (hybrid)** | `(site)/layout.tsx` still prefers published `StorefrontDocument`, else theme `SiteHeader` / `SiteFooter`. |
| FA/EN locale messages | **Pass** | `messages/fa.json` and `messages/en.json` have the same flattened key set (0 only-EN, 0 only-FA). No value that is only «ندارد». |
| Persian digits / Jalali / breadcrumb | **Pass (admin)** | Unchanged from M10. Public cafe reservations were already a documented `datetime-local` exception. |
| Hardcoded user-facing strings | **Partial** | A-L2 strings moved. **R2-L3** Fixed: `ویدیو` and `تومان` and the guest checkout / review errors are in `messages/{fa,en}.json`. |
| Nav vs API capabilities | **Partial** | C2C settings nav matches `settings.manage` / `commerce.*` (A-H2). **R2-M2** Fixed: AI and the other content modules use `content.manage`. |
| Module patterns | **Pass / partial** | Kernel manifests and `module:` middleware still wrap features. Several modules stop at `module:` and never add `can:` (**R2-M2**). |
| Duplicate routes / aliases | **Pass** | A-L6 redirects still in `routes/api.php` (`POST /products/bulk-sale` 307; per-gateway settings aliases). Sampled Basalam/Digikala webhook URLs in the panel match `marketplace_platforms.php`. |
| ERP platform billing integrity | **Pass** | Unchanged: browser return does not set paid; local license flips only when ERP returns a license object (A-M2). |

---

## Findings

| ID | Status | Severity | Area | OWASP | Evidence | Impact | Fix |
| --- | --- | --- | --- | --- | --- | --- |
| **R2-H1** | **Fixed** | high | orders / stock / status | A01 / A04 | `OrderWriter::rewrite` (around lines 141–196) deletes items, inserts new ones, and `$order->update()`s `status` directly. `OrderStatusObserver::updated` calls `OrderLifecycle` only when `status` changed. `OrderStock::reduce` returns immediately when `meta.stock_reduced` is already set, and `stock_reduced_qty` is keyed by the old item id. `PATCH` uses `OrderStatusTransitions`; `PUT` rewrite and the initial `create` status do not. | A user with `orders.own` can swap the SKU on a sale-status order. The old SKU stays decremented. The new SKU is not. A later restore uses `$reduced[$key] ?? $item->quantity` against the new lines, so the wrong product can be incremented. The same request can set a status `update()` would reject (for example `pending_payment` → `completed`), which is a sales status, so stock and reports treat an unpaid order as sold. | Run item replacement through one stock routine: restore the old ledger, assert and reduce the new lines, and rewrite `stock_reduced_qty` to the new ids. Send status only through `OrderStatusService::apply`. Do not let `orders.own` set `paid` / `completed` on create unless that role is explicitly a cashier. |
| **R2-H2** | **Fixed** | high | pricing / SSRF | A10 | `POST /pricing/products/{product}/reference-fetch` (`can:catalog.*,commerce.*`) validates `url` as `url` and passes it to `ReferencePriceService::sync`. `detectSource` returns `woocommerce` for every other host (line 45). Default `sources.woocommerce` is `true` (`PricingCalculator` defaults). `woocommerce()`, `body()`, and `json()` use `Http::get($url)` with no private-IP check and with redirects left on. `technolife` / `basalam` also `body($url)` after a `str_contains` host test (`technolife.`, `basalam.com`), which matches `eviltechnolife.com`. Digikala itself calls `https://api.digikala.com/...` and is not this bug. Failures return `HTTP {status}` to the client. | A catalog or commerce user can make the app GET loopback, link-local, or any internal host, and can read the status code back. A 302 from an attacker host follows into that network. This is not unauthenticated. | Allow-list hosts per source. Resolve and reject private, link-local, and metadata addresses before connect. Disable redirects or re-check every hop. Do not treat unknown hosts as WooCommerce. |
| **R2-M1** | **Fixed** | medium | orders / pricing | A04 | A-M5 strips `items.*.unit_price_minor` unless `orders.*` or POS (`OrderController::withoutUnauthorizedPrices`, `mayOverrideUnitPrice`). `validateOrderPayload` still accepts `discount_minor`, `shipping_minor`, `amount_paid_minor`, and `status`. `OrderWriter::create` applies `discount_minor` whenever there is no coupon (line 32) and stores `status` from the client (default `processing`, which is a sales status). | `orders.own` cannot set the unit price, but can set a discount equal to the subtotal and a sales status. The order is recorded at zero and stock still drops. That undoes the point of A-M5. | Ignore client discount, shipping, and amount paid for `orders.own` unless a coupon or a shipping quote produced them. Default manual orders to a non-sale status unless the actor has `orders.*` or `pos.use`. |
| **R2-M2** | **Fixed** | medium | modules / authz | A01 | Under `staff`, these groups are only `module:` with no `can:`: `profile`, `academy`, `portfolio`, `announcements`, `testimonials`, `team`, `consultations`, `ai-content`, `ai_recommendations` (`routes/api.php` around 864–986). `AiContentController::saveSettings` writes provider keys. `AiContentSettings::public` masks them on read. `frontend/modules/ai-content/manifest.ts` routes have no `capability`. `EnsureStaffRole::ROLES` includes `seller`, `accountant`, `author`, `editor`. | Any staff role on a tenant with the module can replace AI API keys and edit academy, resume, announcements, and consultations. Nav hiding does not stop the API. | Gate AI settings and generation with something like `content.manage` or a dedicated `ai.manage`. Put the same capability on the other content modules that already use it for blog/CMS. |
| **R2-M3** | **Fixed** | medium | builder / XSS | A03 | `sanitizeHtml` in `frontend/src/builder/render/widgets.tsx` strips `<script>` and, only when `window` is defined (line 300), runs DOMPurify with an allow-list. The server render returns the regex result, then `HtmlWidget` uses `dangerouslySetInnerHTML`. `VideoWidget` treats any `src` that `includes("youtube.com")`, `youtu.be`, or `aparat.com` as an iframe URL. | The first HTML the browser parses is not the allow-list. A `content.manage` user (or anyone who can save builder HTML) can ship `onerror` / `javascript:` that runs for storefront visitors before hydration. An iframe `src` of `https://evil.example/youtube.com` is embedded. | Sanitize on the server with the same allow-list (or render HTML only after purify). Parse embed URLs and allow only the real YouTube and Aparat hosts. |
| **R2-M4** | **Fixed** | medium | rate limit / proxies | A07 | `bootstrap/app.php` `trustProxies(at: '*', … X-Forwarded-For)`. Login, OTP, and `public-writes` use `$request->ip()`. The comment says Caddy is in front. | If PHP is reachable without a proxy that **replaces** `X-Forwarded-For`, a client can rotate that header and skip the 5/minute login cap and the public-write cap. Behind a correct edge proxy this is latent. | Trust only the proxy addresses. Do not use `*`. |
| **R2-L1** | **Fixed** | low | public writes | A04 | `throttle:public-writes` covers consultations, cafe reservations, event bookings, phone register, cart items, and checkout. It does **not** cover `POST /catalog/items/{slug}/reviews`, `POST /cafe/products/{product}/like`, `POST /cafe/products/{product}/feedback`, or `POST /orders/{order}/pay/intent`. Reviews default to `require_approval`. Feedback inserts a row immediately. | Spam and DB growth. Not an auth bypass. Pay-intent still needs the pay token. | Put the same limiter on those four routes. |
| **R2-L2** | **Fixed** | low | payments | A08 | `PaymentCallbackController` Digipay (`$amountOk` when `amount` is null or `''`) and BNPL (`$reported === null`) still succeed when the provider body has status success and no amount. `providerId` / payment token must still match the intent, and verify is still required. | Weaker amount binding than a forced equality. Not a bare GET paid mark. | Require the verified amount to equal `amount_rial`. |
| **R2-L3** | **Fixed** | low | i18n | — | `widgets.tsx` placeholder and iframe title `ویدیو` (also on EN). `frontend/src/builder/catalog.ts` appends `تومان`. Guest checkout and review errors are English literals (`Cart contains a product that is not for sale.`, `Reviews disabled`). FA/EN catalogs match; no bare «ندارد». | EN storefront still shows Persian fragments. Catalogs are bypassed for those strings. | Move them into `messages/{fa,en}.json`. |
| **R2-L4** | **Fixed** | low | orders API | — | `OrderController::bulk` calls `OrderStatusService::apply` and always returns `{ok: true}` even when `apply` returns false because the transition is illegal. | The panel can show a status change that did not persist. | Return the ids that were skipped. |

No critical finding. Nothing in this table re-opens a customer payment callback, wallet staff debit, or an unsigned Digikala webhook.

---

## Still Fixed

Re-read at `2f6eba5`. Not re-executed as tests.

### r1 A-* (closed in `2f6eba5`)

| ID | Still holds because |
| --- | --- |
| A-H1 | `MarketplaceWebhookController::digikala` 403s on empty secret and on HMAC mismatch. `MarketplaceSettingsService` rejects enabling Digikala without `webhook_secret`. |
| A-H2 | `GET/PUT /c2c/settings` use `can:settings.manage,commerce.*`. Receipts/decide stay on `orders.*,orders.own`. |
| A-M1 | Setup mutations, including license sync on setup, sit in `can:settings.manage,system.manage`. `GET /setup/status` stays outside that group. |
| A-M2 | `ModuleMarketplaceController::purchase` forwards `pay: true` and does not copy client `mark_paid`. Local `licensed` updates only when `license` is a non-empty array. |
| A-M3 | The six public write routes named in r1 use `throttle:public-writes` (30/min per IP+tenant, 120/min per tenant). See **R2-L1** for routes that were never on that list. |
| A-M4 | `ModirPayamakClient::normalizePath` rejects `..`, null bytes, `//`, and characters outside `[A-Za-z0-9_/-]`. |
| A-M5 | `withoutUnauthorizedPrices` unsets `unit_price_minor` unless `orders.*` or `/pos/orders` with `pos.use`. **R2-M1** is the discount hole beside that, not a revert of the unset. |
| A-L1 | `GET /inventory/summary` is `can:catalog.*,reports.shop`. |
| A-L2 | Add-to-cart and the API status map are not the old hardcoded FA strings. Remaining literals are **R2-L3**. |
| A-L3 | FA/EN key sets match. Gateway and billing empty states are not the single word «ندارد». |
| A-L4 | `callbackOrder` adds `tenant_id` when the host is not internal. |
| A-L5 | Digipay returns failed when `providerId` is empty. No `latestIntent` fallback. |
| A-L6 | `POST /products/bulk-sale` is a 307 to `catalog.bulk-sale`. Gateway `/settings` aliases redirect. |

### Full reaudit C/H/M/L

| Prior ID | Spot-check |
| --- | --- |
| C1 | `rejectStaffWalletTender` still 422s a staff change to wallet. `WalletCheckout::isWalletOrder` requires `meta.wallet_checkout` **and** tender or provider `wallet`. |
| C2 | `BotController::webhook` still requires a non-empty secret and `where('webhook_secret', $secret)`. Settings expose `has_webhook_secret` only. |
| H1 | `OrderController::find` and bulk still `OrderAccess::scopeOwned`. |
| H2 | `C2cController::decide` still requires card-to-card and a confirmable status, then `OrderStatusTransitions`. |
| H3 | Zarinpal/Digipay/BNPL still `intentMatching` plus verify. Bare GET does not call `markPaid`. |
| H4 | Checkout still 422s a bad `shipping_instance_id` and rejects client zero shipping when a rate exists and no free-shipping rule applies. |
| H5/H6 | `OrderStock::adjust` still `lockForUpdate`. Negative deltas still `where stock >= qty` then `stock - N` with `N` an int. **R2-H1** is rewrite not calling this for the new lines. |
| H7 | Core update, module install, themes, bots, SMS, variants still have `can:`. **R2-M2** is the modules that never got that middleware. |
| H8 | Wallet adjust route remains `accounting.manage` / `commerce.*`. Customer `walletTopup` still 422s with “requires a completed payment”. |
| H9 | Return refund still `lockForUpdate`, caps refund at remaining total, and `creditRefund` dedupes on `order_return` + id. |
| M1 | Guest checkout still rejects `is_sold_out` and calls `assertLinesAvailable` inside the transaction. Price is `storefrontPriceMinor`. |
| M2 | `releaseBeforeDelete` still restores stock, wallet remainder, and coupon before trash/delete. |
| M3 | `analytics/summary` still `can:reports.shop,orders.*`. |
| M4 | C2C settings capability matches the API (the old A-H2 exception is gone). |
| M5 | Metrics still 404 unless `X-Health-Token` matches a non-empty configured token. |
| M6–M9 | Not contradicted by this pass (coupon hash, stats, storefront scope). Coupon `hold` still `lockForUpdate`s the usage limit. |
| M10 | Admin locale helpers not reverted. |
| L1–L4 | Coupon password mutator present. DOMPurify allow-list present on the client (**R2-M3** is the SSR skip, not a deleted allow-list). Chart CSS still hex/name. CSRF approach unchanged. |

Also still true: provision HMAC empty secret returns 503 (`ProvisionController`); product `update` calls `StatusTrash::guardPublish`; download `serve` rejects a bad signature, a non-sales order, and a path containing `..` or a URL.

---

## Suggested fix order

1. **R2-H1** — stock ledger and status writer on order rewrite (and stop `orders.own` from inventing a sale).  
2. **R2-H2** — block private hosts on reference fetch; unknown hosts are not WooCommerce.  
3. **R2-M1** — stop trusting `discount_minor` for `orders.own`.  
4. **R2-M3** — purify builder HTML on the server.  
5. **R2-M2** / **R2-M4** / lows — capability gates, proxy trust, leftover throttles.

---

## Audit metadata

- Doc added on `main` in the working tree. Do **not** push.  
- Authoring time (Asia/Tehran): 2026-10-03 ~21:33 +0330  
- Findings R2-H1, R2-H2, R2-M1–R2-M4, and R2-L1–R2-L4 marked **Fixed** in this tree (still not pushed).  
- Tests: `php` is still not on PATH. PHPUnit ran in the local `webino-dashboard-backend` image (order rewrite/stock, `orders.own` commercial terms, Digipay amount, reference-host SSRF, content.manage, bulk skipped ids, public-write throttles, Digikala reference fetch). Node ran `sanitize-html.test.ts` (server allow-list and embed hosts).
