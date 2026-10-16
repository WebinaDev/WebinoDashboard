# WP WebinaDashboard ↔ WebinoDashboard — delta audit (2026-10-16)
Read-only code audit. NEW HEAD = 40b6a81. Builds on docs/WP_PARITY_AUDIT.md (phases 0–12 marked done except ERP migrate run).
Legend: P = priority (B blocker / H high / M medium / L low), Owner = Dash | ERP.

## 1) Gaps — in OLD, missing/incomplete in NEW
### Bots (Bale/Telegram) — biggest gap
| Gap | OLD evidence | NEW state | P | Owner |
|---|---|---|---|---|
| Conversational shop bot (store/cart/checkout/payment/account/admin flows) | Modules/bale-bot-module/engine/Bot/* (StoreFlow, CartFlow, CheckoutFlow, PaymentHandler, AccountFlow, AdminFlow, Router) + telegram twin | BotController::webhook only logs the message + upserts session; no replies/menus | H | Dash |
| Bot add-ons: FAQ, tickets, loyalty/club, card-to-card, channel publisher (schedule/auto-post/edit/delete), order cascade, site widget, segments, templates, admin-ops, outbound retry queue | includes/bots/*.php (22 files, ~7.6k lines) | Only UI toggles in bot-settings-shared.tsx (ADDON_KEYS) saved in meta; no backend reading them | H | Dash |
| Abandoned-cart recovery (bot + SMS) | bale-bot Woo/AbandonedCartService, sms-panel sms-recovery.php | No code | H | Dash (send via ERP) |
| Back-in-stock via bot, wishlist/address book in bot, product→channel sync | Woo/BackInStockNotifier, ProductChannelSync, StockWatchRegistry | Not in bots (storefront stock-alert exists separately) | M | Dash |
### SMS
| Warehouse-stock SMS | sms-warehouse-stock.php | not found | L | Dash |
| ERP ModirPayamak migration run on prod | — | file ready, `migrate --force` not run (only open item in parity doc) | H | ERP |
| sms_ad_campaigns migration + deploy | — | code on main 40b6a81, not deployed | H | Dash |
### Security
| Shield parity: malware/DB scan, threat feeds, geo-block, rate-limit classes, canary, forensics, self-heal, reports/audit, security score | Modules/security-module/includes/class-webino-shield-* (28 files) | Only WafGuard + LoginAttemptService + headers + 2FA | M (some N/A in Laravel) | Dash |
### Shipping
| City flat rates, district at checkout, professional packaging/box packer, shipping map | Modules/shipping-module (flat-city, packer, packaging, checkout-district, map) | ShippingZonesService = zones + flat/free/pickup/pishtaz/tapin, ShipmentWeight; no per-city/packaging | M | Dash |
### Commerce / catalog
| Variation swatches storefront render | class-webino-dashboard-variation-swatches.php | show_swatch_label stored on attribute; no storefront renderer found (verify in @webina/ui) | L | Dash |
| Offer engine (Basalam-style templates/auto-apply) | class-webino-dashboard-offer-engine.php | CouponService has eligibility/auto-apply; templates parity unverified | L | Dash |
### Not gaps (WP-only by nature)
WP core updater/build pipeline, YITH migration, WooCommerce add-ons, torob-products-extractor (marked deprecated), wnc-core (absorbed into marketplace adapters). Affiliate / gift card: not in OLD either.

## 2) New in NEW (did not exist in OLD)
- Verticals: Cafe (branches, tables+QR, kitchen, PDF menu, engagement inbox, reservations, pickup slots), Academy, Corporate/portfolio/team/testimonials, Magazine & Blog split, Resume, LinkHub, CoffeeProfile in-core, MultiVendor (vendor stores/withdrawals/portal).
- Page builder (Builder*, theme builder, globals, revisions, A/B, kits/library, form files/webhook/CRM/captcha, roles, collections) + @webina/ui v0.2.0 shared widgets (team-grid, media, auth forms, layout containers, site header/footer, cafe-table-booking, archive filters, reviews form).
- Multi-tenant SaaS: Tenant/provision/billing, impersonation, license by domain identity, module marketplace with git install, ERP announcements, mobile contract API, OpenAPI.
- WordPress import pipeline, AI recommendations, product stories/modifiers/allergens/compare/Q&A/downloads, menu banners, polls, consultations.
- Payments hub: zarinpal, zibal, digipay, snapppay, torobpay, bale_pay, c2c, wallet, cod + BNPL badges; Snapp shipping tracker.
- Security: TOTP 2FA + recovery codes, WAF middleware, login throttling, OWASP audits.
- SMS ad campaigns + segments, drafts/scheduled/newsletter local, secretary rules (40b6a81).

## 3) Redesigned / fixed
- Stack: WP+React SPA → Laravel API + Next.js SSR, minor-unit money, tenant scoping.
- Admin-route RBAC holes, cross-tenant login, broken links, orphan SMS pages — fixed (parity phase 0).
- License status from ERP (active/demo/expired), CRM notes ↔ ERP, tickets ↔ ERP projects, accounting ledger live-ERP with fallback.
- Vendor names hidden from UI, i18n sweep, no "coming soon".
- Cafe audit fixes (bb566b5): single cart, delivery address/slots, item pages, Persian API errors, closed days.

## 4) WIP / stub items in OLD still not ported
Bot add-on suite and bot commerce flows; abandoned-cart recovery; channel publisher; shield scanners/feeds/geo; city/packaging shipping. (No `~~` struck-through backlog remains open in OLD docs — FULL-AUDIT-v2 items were closed.)

## 5) Suggested order
1. Deploy 40b6a81 + migrations; run ERP ModirPayamak migrate. 2. Bot engine (webhook router + store/cart/checkout) then add-ons. 3. Abandoned-cart recovery. 4. Shipping city/packaging. 5. Security extras. 6. Swatches/offer templates.
