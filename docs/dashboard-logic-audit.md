# Tenant admin logic audit

Audit of `WebinaDev/WebinoDashboard` at `c513621` (`fix(admin): trash, content nav, and tenant tools`). Read-only. No product code was changed.

Scope: tenant admin for commerce, content, builder, marketing, coffee profile, license, roles, trash, bulk price, stats, account, and settings. Findings are business-rule and consistency bugs in this tree, not generic SaaS advice.

Severity:

- **blocker** — wrong money, inventory, or access that a tenant or customer can hit on the normal path.
- **major** — state, permission, or report behavior that disagrees with the rule the UI implies.
- **minor** — recoverable inconsistency, dead vocabulary, or misleading empty state.

## What already lines up

These paths were checked and are internally consistent. They are listed so later fixes do not “re-solve” them.

- Single-order `PATCH` uses `OrderStatusTransitions::canTransition` and refuses edits on `completed`, `refunded`, `cancelled`, `failed`, and `webino-deleted` except status, print, and tracking (`OrderController::update`).
- Order-list revenue uses `OrderReports::salesStatuses()` (every status except the unpaid / cancelled / refunded / review set). The home analytics summary does not. See O-12.
- POS product search requires `status = publish` (`OrderController::posSearch`). The public catalog does not. See C-1.
- `StatusTrash` is wired for products, categories, brands, product tags, blog posts and categories, CMS pages, and magazine articles: default lists hide `trash`, delete moves to trash, `force` deletes only from trash, restore reads `meta.pre_trash_status`.
- Coupon percent and fixed discounts use integer `floor`, not float (`CouponService::evaluate`).
- Checkout tax is integer and is added to the total only when prices are tax-exclusive (`OrderTax::compute`, `CheckoutController`).
- Wallet balance changes take a row lock and refuse a debit below zero (`WalletService::adjust`). The hole is which callers credit without a prior debit. See W-1, R-2.
- Staff impersonation is a cache flag on the issued token, not a second user. The bar is honest about the ERP staff name. The principal is still the tenant user. See I-1.

---

## Catalog, stock, and checkout

### C-1 — blocker — Storefront lists and sells non-published products

**Symptom.** A draft, pending, private, or `NULL`-status product is on the public catalog and can be added to a cart. Trash is the only status excluded. POS search, by contrast, requires `publish`.

**Root.** `PublicCatalogController` index and show:

```40:45:backend/app/Http/Controllers/Api/V1/PublicCatalogController.php
        $productsQuery = Product::query()
            ->where('tenant_id', $tid)
            ->where('is_hidden', false)
            ->where(function ($q) {
                $q->whereNull('status')->orWhere('status', '!=', 'trash');
            })
```

The same `!= trash` predicate is used for categories (lines 33–35) and product show (lines 171–177). Authenticated cart add only checks tenant (`CartController::addItem`, lines 30–31). Guest cart checks `is_hidden`, `is_available`, and `is_sold_out`, not `status` (`PublicGuestCartController::addItem`, line 41). Neither checkout re-checks status.

**Repro.** Set a product to `draft` or `private`. Open the public catalog. Or trash it, then `POST` the guest or user cart with that `product_id` while `is_available` is still true.

**Fix.** One sellable scope: `status = publish`, not hidden, stock and backorder rules. Use it in public catalog, both carts, and both checkouts. Treat `NULL` status as draft.

### C-2 — blocker — Web and cafe checkout never change stock

**Symptom.** Two customers can buy the last unit. Cancelling or refunding in admin does not put stock back. `manage_stock`, `backorders`, and `hold_stock_minutes` do not reserve inventory.

**Root.** `CheckoutController::store` and `PublicGuestCartController::checkout` create order lines and never touch `products.stock` or variant stock. The only decrement found is `MarketplaceOrderImporter` (around lines 300–335), and that restore runs only when the marketplace importer changes status, not when admin `OrderController::update` does. `CartController::expireHeldStock` (lines 110–123) deletes stale cart lines after `hold_stock_minutes`. It never decrements stock. `ProductStockObserver` sends notifications only.

**Repro.** `manage_stock = true`, `stock = 1`. Two checkouts of quantity 1 both succeed. Stock stays 1.

**Fix.** Decrement inside the checkout transaction with `lockForUpdate`, honoring backorders. Restore once, idempotently, on transition into `cancelled`, `refunded`, or `failed`, including marketplace orders cancelled from the order screen.

### C-3 — major — Three different prices for one product

**Symptom.** The catalog price, the logged-in checkout price, and the cafe table price are not the same number.

| Path | Price used |
| --- | --- |
| Public catalog `discounted_price_minor` | `price_minor` reduced by `discount_percent` (`SerializesCatalogProduct`, lines 12–14) |
| Logged-in checkout | `PurchaseTypeService::unitPrice` → `Product::effectivePriceMinor` (sale window or regular). `discount_percent` is ignored (`Product.php` lines 147–149) |
| Cafe guest checkout | raw `price_minor` (`PublicGuestCartController::checkout`, lines 82–84 and 104). Sale price, discount percent, tax, and shipping are all skipped. `subtotal_minor` is left unset; only `total_minor` is stored |

**Repro.** Product with `price_minor = 100000`, `sale_price_minor = 80000`, `discount_percent = 20`. Catalog shows 80000 from the percent (or the sale, depending on the client). Logged-in checkout charges 80000 from the sale. Guest table checkout charges 100000.

**Fix.** One unit-price function for catalog, both carts, and both checkouts. Either fold `discount_percent` into `effectivePriceMinor` or stop publishing `discounted_price_minor`.

### C-4 — major — Tapin weight is a constant, and a missing rate trusts the client

**Symptom.** Shipping quotes ignore the product’s weight. A checkout with no matching zone can set shipping to whatever the client posts, including 0.

**Root.** `CheckoutController` line 78: `$weightG += max(100, (int) $line->quantity * 200);` — 200 g per unit, not `products.weight`. Lines 165–167: if no rate is selected, `shipping_minor` from the body is stored as-is. Order currency is the first line’s `product.currency` (line 212), so a mixed-currency cart is labeled with one currency and summed as if the integers matched.

**Fix.** Quote with the stored weight. Reject checkout when the cart needs shipping and no zone rate matches. Sum only lines that share the tenant currency.

---

## Orders

### O-1 — major — Bulk status, rewrite, Tapin, and card-to-card skip the transition graph

**Symptom.** The order screen blocks illegal jumps. Bulk actions, rewrite, Tapin refresh, and card-to-card approval do not.

**Root.**

- Bulk `change_status` writes `status` for every selected id (`OrderController::bulk`, lines 264–267). No `canTransition` call.
- `OrderWriter::rewrite` (lines 138–169) blocks only `completed`, `refunded`, `cancelled`, and `failed`. It then copies `status` from the payload. It also rebuilds `total_minor` as `subtotal - discount + shipping` and drops `tax_minor`.
- `TapinShipmentService` assigns `OrderShippingStatuses::fromTapinCode` straight onto `order.status`. Unknown codes become `webino-need-review` (`OrderShippingStatuses.php` lines 94–95). Code 80 maps to `webino-deleted`.
- `C2cController::decide` (lines 90–104) sets `paid` on approve and `failed` on reject from any current status, including `cancelled` or `completed`.

**Repro.** Bulk-set `completed` orders back to `pending_payment`. Or approve a card-to-card receipt on a cancelled order. Or refresh Tapin with an unmapped code and watch the order leave the shipping pipeline.

**Fix.** One status writer. Tapin and card-to-card may only move through `canTransition`. Unknown Tapin codes stay in `meta`. Rewrite must not change status, and its total must keep tax.

### O-2 — major — A partial return marks the whole order refunded

**Symptom.** Refunding one return sets the order to `refunded` even when `refund_minor` is a fraction of `total_minor`. Stock is not returned. Exchange (`exchanged`) changes neither stock nor order status.

**Root.** `OrderController::returnsAction` lines 419–421. The return graph itself is real (`approve` only from `requested`, `refund` only from `parcel_received` or `received`). The order update is not run through `OrderStatusTransitions`. Wallet credit uses `payment_tender === wallet` with no check that checkout ever debited the wallet (checkout has no wallet debit; see W-2).

**Fix.** Keep the order in a partial-refund status unless the refund covers the total. Restore stock for the returned lines. Credit the wallet only against a prior `checkout` debit, keyed by return id.

### O-3 — major — Refund reports count returns that have not been paid

**Symptom.** Financial reports treat `approved` returns as refunds. `completed` is in the refund list and is not a return status.

**Root.** `OrderReports::REFUND_RETURN_STATUSES = ['approved', 'refunded', 'completed']` (line 37).

**Fix.** Count `refunded` only, and only the stored `refund_minor`.

### O-4 — minor — “Pending” on the orders list is only `pending_payment`

**Symptom.** Orders sitting in `awaiting_gateway` or `on_hold` do not increment the pending stat (`OrderController::index`, line 40). The status stepper has no `shipped` step (`ORDER_STATUS_PIPELINE` in `frontend/modules/commerce/lib/order-statuses.ts`), so a `shipped` order draws every step as incomplete.

**Fix.** Pending should be the unpaid set (`pending_payment`, `awaiting_gateway`, `on_hold`, `payment_failed`). Map `shipped` onto the pipeline or show it as a side branch.

### O-5 — major — Orders “trash” is a soft delete with no trash screen

**Symptom.** Bulk trash and `DELETE /orders/{id}` set `deleted_at` (`Order` uses `SoftDeletes`). There is no `withTrashed` list and no restore. Product trash is a `status` value with a tab. The two “trash” actions do not mean the same thing. Coupons do both: set `status = trash` and then soft-delete (`CouponController::destroy` lines 89–90, bulk lines 104–105), so the row leaves the default scope immediately and the trash status is never listed.

**Fix.** Pick one model per type. If orders stay soft-deleted, the bulk label should be delete and a trashed view should restore. Coupons should not set `trash` and delete in the same request.

---

## Coupons

### K-1 — blocker — The coupon is spent when the order is still unpaid

**Symptom.** A one-use code is consumed at checkout while status is `pending_payment`. Abandoning payment still increments `usage_count` and the per-user redemption count. A second simultaneous checkout can pass the limit check before either increment lands.

**Root.** `CheckoutController` lines 233–235 call `CouponService::redeem` inside the order transaction, before payment. `evaluate` counts `CouponRedemption` rows with no order-status filter (lines 124–131). `redeem` (lines 183–192) inserts the row and `increment('usage_count')` without `lockForUpdate`. `OrderWriter` redeems the same way for POS and pay-link creates.

**Repro.** Limit 1. Apply the code, create the order, never pay. The code is dead. Or send two checkouts in parallel against a limit of 1.

**Fix.** Redeem on the transition into a sales status (payment callback, card-to-card approve, wallet capture). Lock the coupon row in that transaction. Count redemptions whose orders are in `OrderReports::salesStatuses()`.

### K-2 — major — Schedule and password on the coupon editor are not enforced

**Symptom.** The editor stores `scheduled_at`, `visibility = password`, and `password`. Checkout accepts the code as soon as `status = publish` and `expires_at` is in the future. A future `scheduled_at` does not wait. A password is never compared.

**Root.** `CouponService::evaluate` (lines 114–118) checks expiry and limits only. `CouponController` persists `visibility`, `password`, and `scheduled_at` (validation around lines 163–165) and nothing reads them at apply time.

**Fix.** Reject apply when `scheduled_at` is in the future or `visibility` is not public, and require the password when `visibility = password`.

---

## Wallets

### W-1 — blocker — A customer can credit their own wallet

**Symptom.** `POST /api/v1/account/wallet/topup` adds spendable balance with no payment. The route sits in the signed-in group, before the `staff` middleware (`routes/api.php` lines 306–327). `PortalAccess` allows `account.portal`, which is the customer role. Wallet settings default to `enabled => true` (`WalletService::defaultSettings`).

**Root.** `AccountPortalController::walletTopup` lines 286–308 call `WalletService::adjust(..., 'credit', 'topup')` directly.

**Repro.** Sign in as a customer on a tenant whose wallet row is missing or enabled. Post `amount_minor`. `wallet_balance_minor` increases. A later return with `payment_tender = wallet` can credit again (O-2) even though checkout never debited.

**Fix.** Top-up must be a payment intent that credits only on callback. Until that exists, staff-only.

### W-2 — major — Wallet is offered as a tender and never debited

**Symptom.** Ledger reasons include `checkout` and `checkout_restore` (migration comment and WordPress import). No checkout or payment callback debits `wallet_balance_minor`. Withdrawal requests debit immediately and only `rejected` credits back (`WalletService`); `approved` leaves the money gone until `paid`.

**Fix.** Debit on wallet capture with an idempotency key of `order_id`. Restore on cancel. Treat `approved` as still pending or as paid, and say which in the withdrawals screen.

---

## Tickets and the customer portal

### T-1 — blocker — Customer ticket links land on the staff inbox

**Symptom.** A customer opening their ticket is sent to `/dashboard/tickets/:id`, which `PermissionGate` wraps with staff roles.

**Root.** `frontend/src/kernel/legacy-redirects.mjs` line 32:

`/dashboard/account/tickets/:id` → `/dashboard/tickets/:id`

Staff replies store the account URL (`SupportTicketController::staffReply`, line 81). The redirect then rewrites it. This is not an infinite loop. It is the wrong principal.

**Fix.** Delete that redirect. Keep `/dashboard/account/tickets/:id` for the portal.

### T-2 — blocker — `subscriber` cannot open the portal the role list says they have

**Symptom.** WordPress-style subscribers are rejected by the account API and the account UI.

**Root.** The capability seed gives `subscriber` only `portal.read` (`2026_09_27_210000_role_capabilities.php` lines 87–88). `PortalAccess::allows` and the portal `PermissionGate` require `account.portal` or `partner.portal`. `customer` and `partner` have those. `subscriber` does not.

**Fix.** Grant `account.portal` to `subscriber`, or accept `portal.read` in `PortalAccess`. Do not leave both.

### T-3 — major — Staff replies reopen a closed ticket

**Symptom.** A customer cannot reply to `closed` (`accountReply` aborts, line 93). A staff reply does not check status and forces `answered` (lines 68–74). `staffPatch` can set any of `STATUSES` with no graph (lines 105–116).

**Fix.** Staff reply on `closed` should fail, or require an explicit reopen. Do not silently set `answered`.

---

## Trash and content

`c513621` added `StatusTrash` and the coffee-gate migration. The helper is sound. Several writers bypass it, and the public catalog uses it as “not trash” rather than “published” (C-1).

### D-1 — major — Bulk trash and raw status updates forget the previous status

**Symptom.** Trash from the product row stores `meta.pre_trash_status` (`ProductController::destroy`, lines 295–298). Bulk `status: trash` and a normal product update do not. Restore then falls back to `draft`, so a published product comes back unpublished.

**Root.** `ProductController::bulkUpdate` lines 266–271 mass-`update` the status column. The same bulk path’s restore helper is correct (lines 236–244) and then finds no previous status.

**Fix.** Any transition to `trash` must go through `StatusTrash::rememberPrevious`. Reject `status=trash` on the generic update.

### D-2 — major — Builder delete and publish ignore CMS trash

**Symptom.** Deleting a page in the builder removes the row (`BuilderController::destroy`, lines 243–245). CMS delete only sets `status = trash` and can be restored. Publishing a trashed page in the builder sets `published = true` and `status = published` with no trash check (lines 110–117), so a trashed page goes live and keeps `pre_trash_status` in `meta`.

**Fix.** Builder delete should call the CMS trash path. Publish should refuse `status = trash` until restore.

### D-3 — major — Magazine categories are trashed with no trash UI

**Symptom.** Delete on the magazine categories screen calls `DELETE` with no `force` (`frontend/modules/magazine/admin/categories-page.tsx` lines 73–74). The API soft-trashes and the list hides the row. Restore exists on the API and is not in the UI. The row looks permanently deleted. Category post counts still include trashed articles (`MagazineTaxonomyController` article count has no status filter).

**Fix.** Same trash tab, restore, and force-delete as brands and product categories. Exclude `trash` from the post count.

### D-4 — major — Trashing a parent category leaves children on the storefront

**Symptom.** `CategoryController` trash updates that row only. Public categories are every non-trash row (`PublicCatalogController` lines 31–35). A child with `status = publish` stays in the menu after its parent is trashed.

**Fix.** Hide a category whose ancestor is `trash`, or cascade trash.

### D-5 — minor — Slug uniqueness includes trashed rows, and `NULL` status is counted two ways

**Symptom.** Categories use `unique(tenant_id, slug)` including trashed rows, so recreating a trashed slug fails. `StatusTrash::apply` treats `NULL` status as visible. Queries written as `where status != 'trash'` (pricing base query, blog “all” count) drop those `NULL` rows in SQL. Product list `total` therefore does not equal publish + draft + pending + private when legacy `NULL` rows exist. Admin pickers for categories, brands, and tags do not apply `StatusTrash`, so trashed terms stay selectable. Empty trash tabs reuse the “no products / no pages” copy and, on CMS pages, the create button (`products-page-client`, `cms/pages-page`).

**Fix.** Rename the slug on trash, or use a partial unique index. Backfill `NULL` to `draft` or `publish` and use `StatusTrash::apply` everywhere. Empty copy should depend on the trash filter.

---

## Permissions, nav, and module gates

### P-1 — major — Menu ACL and role capabilities hide the sidebar and not the API

**Symptom.** A seller’s nav can hide Orders. `GET /api/v1/orders` still returns every order in the tenant. `orders.own` is only applied when the client sends `mine=1` (`OrderController::applyOrderIndexFilters`, lines 532–534). The seller seed is `pos.use` and `orders.own` only.

The same shape shows up elsewhere:

- `GET /settings/{area}/{section}` has no `can:` middleware. `PUT` requires `settings.manage` (`routes/api.php` lines 363–365). A seller can read payment and security settings. The settings screens are linked only for `settings.manage`, but the route still renders for any staff role.
- Analytics and shop-report routes declare no `capability` (`frontend/modules/analytics/manifest.ts`). The API uses `can:analytics.view` and `can:reports.shop`. An author sees the nav item and gets 403 on the request.
- `menu_acl` is consulted in `useDashboardNav` only. A denied menu key does not block the URL.
- Staff ticket routes have no capability. Any staff role, including seller and author, can read and reply.

**Fix.** Enforce the same capability on the route that the manifest already names. Default sellers to `created_by = me` unless they have `orders.*`. Put `can:settings.manage` on settings read, or return a reduced payload.

### P-2 — major — `siteTypes` on manifests do not match `SiteTypeProfiles`, and nav ignores both

**Symptom.** Coffee is a full shop in `SiteTypeProfiles` (commerce, CMS, blog, marketing, bots, analytics, users, plus `coffee-profile`). Frontend manifests disagree:

| Manifest | Declared `siteTypes` | Profile includes it for `coffee`? |
| --- | --- | --- |
| `coffee-profile` | `coffee` | yes |
| `commerce` | `ecommerce`, `cafe` | yes |
| `core`, `cms` | no `coffee` | yes |
| `marketing`, `users`, `analytics`, `bots` | no `coffee` | yes |
| `cafe` | `cafe` | no (correct) |

`buildAdminNav` (`frontend/src/kernel/route-resolver.ts` around 238–305) never reads `mod.siteTypes`. It shows a route when the submodule activation is on. `resolveAdminRoute` ignores activation on purpose (comment at lines 79–86), so a disabled module still renders the shell and then the API returns `MODULE_NOT_ACTIVE`.

The coffee gate in `2026_10_03_180000_trash_status_and_coffee_gate.php` (lines 34–45) sets `coffee-profile` `enabled = false` once for tenants whose `site_type_slug` is not `coffee`. `ModuleController::update` does not look at site type, and `EnsureModuleEnabled` only checks the activation row. Re-enabling the submodule on an ecommerce tenant brings the coffee screen and `/api/v1/coffee/*` back.

**Fix.** Filter admin nav by the tenant’s `site_type_slug` using `SiteTypeProfiles`, not the stale frontend arrays. Add `coffee` to the frontend arrays that the profile actually enables. Reject enabling `coffee-profile` unless `site_type_slug = coffee`.

### P-3 — minor — “Marketplace” is three destinations

**Symptom.** `/dashboard/marketplace` redirects to the module catalog (`legacy-redirects.mjs` line 30). The core nav item `settings/shop/marketplace` and the settings strip both open shop marketplace settings. The label key is `nav.marketplace` in both the catalog redirect and the settings page.

**Fix.** One path. Point the legacy redirect at the settings page if that is the product, and stop reusing the catalog label.

---

## Bulk price and license

### B-1 — major — A scheduled percent change compounds, and a failed run double-applies

**Symptom.** A daily 10% schedule does not mean “10% above the original price”. Each run adds 10% of the current `price_minor`. There is no snapshot and no inverse job.

**Root.** `PricingController::runBulkPriceJob` lines 616–621. The scheduler (`routes/console.php` lines 106–112) sets `last_run_at` only after the whole run returns. The loop updates products one by one with no transaction. If it throws halfway, the next hour selects the same schedule again and the already-changed rows move a second time. `lock_price` is skipped, which is correct. The query is `status = publish` only, so this path does not touch trash.

A separate stale-lock rule marks a job failed when `updated_at` is older than 15 minutes (`PricingController::bulkPriceStart`, lines 432–436) while `runBulkPriceJob` does not touch `updated_at` during the loop. A long catalog can still be running when the next job starts.

`RecalculatePricesJob` (lines 76–77) recalculates every product with a purchase price, including `trash` and `draft`.

**Fix.** Store the pre-change price on the job row, apply inside a transaction, and set `last_run_at` only for the ids committed. Heartbeat `updated_at` or take a tenant lock for the whole run. Exclude `trash` from recalculate.

### B-2 — major — Quick-add stores `currency = IRR` on every tenant

**Symptom.** A toman store (`default_currency = IRT`) gets a new quick-add product tagged `IRR` while `price_minor` is in the same whole-unit scale as the rest of the catalog. Later marketplace conversion treats the code as rial.

**Root.** `PricingController` quick-add create, line 263: `'currency' => 'IRR'`.

**Fix.** Use the tenant `default_currency`.

### B-3 — major — License sync is disabled exactly when status cannot be loaded

**Symptom.** If `GET /license/status` errors, the license page shows the API-unavailable state and the Sync button stays disabled, so the tenant cannot run the call that would refresh the license.

**Root.** `frontend/modules/core/admin/license-page.tsx` line 93: `disabled={sync.isPending || q.isError}`.

**Fix.** Disable the button only while the sync mutation is pending.

### B-4 — major — Pricing math and the module gate disagree about `licensed`

**Symptom.** An active or demo tenant can open pricing routes after a sync left `commerce.pricing.licensed = false`, because `EnsureModuleEnabled` treats domain entitlement as enough (lines 37–38 and the comment at 68–71). `PurchaseTypeService::moduleEnabled` still requires `licensed !== false` (line 51). Cart and checkout then ignore wholesale, credit, and installment prices while the pricing screens still load.

**Fix.** Use the same entitlement rule in both places.

---

## Locale (logic, not copy)

### L-1 — major — The Jalali picker reads a Gregorian ISO date as a Jalali date

**Symptom.** Order and product date filters store `YYYY-MM-DD` Gregorian. Reopening the control in `fa` builds a `DateObject` with `calendar: persian` and that same string (`frontend/src/components/LocaleDatePicker.tsx` lines 72–76). The components are interpreted as a Persian year, month, and day. The next change converts that misread value back to Gregorian, so `date_from` / `date_to` jump.

The header comment says the value is always Gregorian. The `onChange` path does convert to Gregorian. The bug is the read, not the write.

**Fix.** Parse with the Gregorian calendar, then convert for display: `new DateObject({ date: value, calendar: gregorian }).convert(persian)`.

### L-2 — major — Persian digits are not numbers on the server or in coffee prices

**Symptom.** The orders screen sends the min/max total as typed (`orders-page-client.tsx` line 249). `OrderController` casts with `(int)` (lines 559–563). In PHP, `(int) '۱۰۰۰۰۰'` is `0`, and `filled()` is still true, so the filter becomes `total_minor >= 0` and matches every order. The UI looks filtered.

Coffee bean prices split each line on a comma and call `Number(price)` (`profile-page-client.tsx` lines 117–119). `Number('۲۵۰۰۰۰')` is `NaN`, which JSON sends as `null` and the saved price becomes 0.

**Fix.** Run `toLatinDigits` before query params and before `Number`. Do the same on the API for numeric query fields.

---

## Stats that disagree with the order machine

### S-1 — major — Home analytics revenue is only status `paid`

**Symptom.** The orders screen sums every sales status (`processing`, `shipped`, `completed`, `webino-packaged`, and the rest of `salesStatuses()`). Home `revenue_minor` and `orders_paid` count `status = paid` only (`AnalyticsController::summary`, lines 32–40). `orders_open` is only `pending_payment` and `processing`, so `awaiting_gateway` and in-transit `webino-*` orders are neither open nor paid. `products` counts every row, including trash and draft.

**Fix.** Use `OrderReports::salesStatuses()` for revenue. Define open as “not in the sales set and not terminal”. Count products with `StatusTrash::apply`.

### S-2 — major — Gross profit is not a margin on the revenue number beside it

**Symptom.** `OrderReports` adds `total_minor` (shipping and tax included) into summary revenue, and computes gross profit from line `unit_price_minor * qty` only. A store with shipping shows a margin that is not `profit / revenue`.

**Root.** `OrderReports.php` around lines 546–551 versus 741–742.

**Fix.** Expose `order_total` and `line_revenue` as separate fields and divide profit by line revenue only, with those labels in the report UI.

---

## Impersonation

### I-1 — major — The bar shows ERP staff; every check runs as the tenant admin

**Symptom.** Panel login issues a token for the tenant `user_id` and stores impersonation as cache metadata (`AuthController::panelLogin`). `password_must_change` is forced false in that response (line 129). `RequirePasswordChange` and `RequireTwoFactor` return early when `ImpersonationSession::active`. The tenant user is typically `admin` with capability `*`. Actions, order `created_by`, and ticket replies are that user, not the ERP staff member named in the bar.

**Fix.** If ERP access is break-glass, record the staff id on writes made during the session. If it should be limited, the token needs a reduced capability set. Do not describe the ERP user as the authorization principal while the tenant admin’s capabilities are in force.

---

## Suggested fix order

1. W-1 wallet self-topup, C-2 stock, K-1 coupon burn, C-1 unpublished products on the storefront, T-1 ticket redirect.
2. C-3 one price function, O-1 one status writer, O-2 partial refunds, B-1 bulk-price transaction.
3. P-1 capability checks on the API, P-2 site-type gate for coffee, D-1 and D-2 trash writers.
4. L-1 Jalali round-trip, L-2 digit normalization, S-1 home stats, B-3 license sync button.

---

## خلاصه برای کاربر (فارسی)

بازبینی منطق داشبورد مستاجر روی کامیت `c513621`. فقط گزارش است؛ کدی عوض نشده.

### فروش، موجودی، پرداخت

- **مسدودکننده.** محصول پیش‌نویس، خصوصی، یا حتی در بعضی مسیرها زباله‌دان، در ویترین عمومی دیده می‌شود و به سبد اضافه می‌شود. فقط وضعیت `trash` حذف شده، نه «فقط منتشرشده». جست‌وجوی صندوق فروش درست است و `publish` می‌خواهد؛ ویترین نه.
- **مسدودکننده.** ثبت سفارش سایت و سفارش میز کافه موجودی را کم نمی‌کند. لغو و استرداد از صفحه سفارش هم موجودی را برنمی‌گرداند. «نگه‌داشتن موجودی» فقط سبد کهنه را پاک می‌کند.
- **مهم.** سه قیمت متفاوت: ویترین درصد تخفیف را نشان می‌دهد، تسویه کاربر واردشده قیمت حراج را می‌گیرد، تسویه مهمان کافه همان قیمت اصلی را بدون حراج و بدون مالیات حساب می‌کند.
- **مهم.** وزن تاپین برای هر قلم ثابت ۲۰۰ گرم است. اگر نرخ حمل پیدا نشود، مبلغ ارسالی کلاینت (حتی صفر) قبول می‌شود.

### سفارش، کوپن، مرجوعی، کیف پول

- **مسدودکننده.** کوپن همان لحظه ساخت سفارشِ پرداخت‌نشده مصرف می‌شود. رها کردن درگاه، سهمیه را می‌سوزاند. دو درخواست همزمان می‌توانند از سقف استفاده رد شوند.
- **مسدودکننده.** مشتری با `POST /account/wallet/topup` بدون پرداخت به کیف پول خودش اعتبار می‌دهد. مسیر مخصوص پرسنل نیست.
- **مهم.** پرداخت با کیف پول در تسویه اصلاً بدهکار نمی‌شود، ولی استرداد می‌تواند بستانکار کند.
- **مهم.** تغییر وضعیت تکی سفارش قانون گذار دارد؛ اقدام گروهی، بازنویسی سفارش، تاپین، و تایید کارت‌به‌کارت این قانون را دور می‌زنند. تاپین با کد ناشناس سفارش را می‌برد روی «نیاز به بررسی». تایید کارت‌به‌کارت می‌تواند سفارش لغوشده را «پرداخت‌شده» کند.
- **مهم.** استرداد جزئی، کل سفارش را `refunded` می‌کند و موجودی را برنمی‌گرداند. گزارش مالی، مرجوعیِ فقط تاییدشده را هم جزو استرداد حساب می‌کند.
- **مهم.** زمان‌بندی و رمز کوپن در ویرایشگر ذخیره می‌شود و موقع اعمال چک نمی‌شود.
- **مهم.** «زباله‌دان» سفارش در عمل حذف نرم است و صفحه بازگردانی ندارد. کوپن هم وضعیت زباله‌دان می‌گیرد و همان لحظه حذف نرم می‌شود.

### زباله‌دان و محتوا (همان خط `c513621`)

- **مهم.** زباله‌دان تکی محصول وضعیت قبلی را نگه می‌دارد؛ زباله‌دان گروهی نه. بازگردانی، محصول منتشرشده را پیش‌نویس برمی‌گرداند.
- **مهم.** حذف در صفحه‌ساز صفحه را واقعاً پاک می‌کند؛ حذف در فهرست صفحات فقط به زباله‌دان می‌فرستد. انتشار از صفحه‌ساز می‌تواند صفحه داخل زباله‌دان را دوباره زنده و عمومی کند.
- **مهم.** دسته مجله با حذف، از فهرست غیب می‌شود و در رابط بازگردانی ندارد (API بازگردانی هست).
- **مهم.** زباله‌دان کردن دسته والد، زیردسته‌ها را از ویترین برنمی‌دارد.
- **جزئی.** اسلاگ دسته حذف‌شده هنوز یکتاست و ساخت دوباره همان اسلاگ خطا می‌دهد. متن «چیزی نیست» در زبانه زباله‌دان همان متن فهرست خالی است.

### دسترسی، منو، قهوه

- **مسدودکننده.** لینک تیکت مشتری (`/dashboard/account/tickets/…`) به صندوق تیکت پرسنل ریدایرکت می‌شود و مشتری پشت درِ نقش پرسنل می‌ماند. اعلان پاسخ پشتیبان همین لینک را می‌سازد.
- **مسدودکننده.** نقش `subscriber` فقط توانایی `portal.read` دارد، ولی درگاه حساب `account.portal` می‌خواهد. مشترک وارد حساب نمی‌شود؛ مشتری و همکار می‌شوند.
- **مهم.** توانایی‌ها و منوی نقش، فقط نوار کناری را قایم می‌کنند. فروشنده می‌تواند کل سفارش‌های مستاجر را از API بگیرد. تنظیمات حساس خواندنی است. آمار در منو هست و API برای نویسنده ۴۰۳ می‌دهد.
- **مهم.** پروفایل قهوه باید فقط سایت قهوه باشد، ولی این محدودیت یک‌بار در مهاجرت دیتابیس اعمال شده. دوباره فعال کردن ماژول روی فروشگاه معمولی، هم منو و هم API قهوه را برمی‌گرداند. فهرست `siteTypes` در فرانت با پروفایل نوع سایت یکی نیست (تجارت و هسته، قهوه را ندارند) و منو اصلاً به این فهرست نگاه نمی‌کند.

### پول، لایسنس، تاریخ، آمار

- **مهم.** تغییر قیمت زمان‌بندی‌شده هر بار روی قیمت فعلی درصد می‌زند، نه روی قیمت پایه. اگر وسط کار بشکند، اجرای بعدی همان کالاها را دوباره گران می‌کند. قفل ۱۵ دقیقه‌ای وسط کار طولانی آزاد می‌شود. محاسبه مجدد از روی قیمت خرید، کالای زباله‌دان را هم عوض می‌کند.
- **مهم.** افزودن سریع کالا واحد پول را همیشه `IRR` می‌گذارد، حتی برای فروشگاه تومانی.
- **مهم.** اگر وضعیت لایسنس خطا بدهد، دکمه همگام‌سازی غیرفعال است؛ همان دکمه‌ای که باید وضعیت را درست کند.
- **مهم.** درگاه ماژول برای مستاجر فعال، قیمت‌گذاری را باز می‌گذارد ولی محاسبه قیمت عمده و اقساط هنوز `licensed = false` را رد می‌کند. صفحه هست، قیمت سبد نیست.
- **مهم.** در فارسی، باز کردن دوباره انتخابگر تاریخ، تاریخ میلادی ذخیره‌شده را به‌اشتباه شمسی می‌خواند و فیلتر سفارش جابه‌جا می‌شود.
- **مهم.** فیلتر حداقل مبلغ سفارش با رقم فارسی به عدد صفر تبدیل می‌شود و عملاً همه سفارش‌ها را نشان می‌دهد. قیمت دانه قهوه با رقم فارسی صفر ذخیره می‌شود.
- **مهم.** درآمد صفحه خانه فقط وضعیت `paid` است؛ فهرست سفارش‌ها وضعیت‌های در حال ارسال و تکمیل‌شده را هم می‌شمارد. سود ناخالص روی جمع اقلام است و درآمد روی جمع سفارش با حمل و مالیات. این دو را نباید کنار هم به‌عنوان یک حاشیه سود خواند.
- **مهم.** نوار «ورود به‌جای کاربر» نام پرسنل ERP را نشان می‌دهد، ولی دسترسی همان مدیر مستاجر با توانایی کامل است. اجبار تعویض رمز و ورود دو مرحله‌ای در این حالت خاموش است. عمل‌ها به نام مدیر سایت ثبت می‌شود، نه پرسنل ERP.

### ترتیب پیشنهادی اصلاح

۱) شارژ رایگان کیف پول، موجودی، سوختن کوپن، دیده شدن کالای غیرمنتشر، ریدایرکت تیکت مشتری.  
۲) یک تابع قیمت، یک نویسنده وضعیت سفارش، استرداد جزئی، قفل تغییر قیمت گروهی.  
۳) توانایی روی خود API، قفل نوع سایت برای قهوه، یکسان شدن زباله‌دان صفحه‌ساز و فهرست.  
۴) تاریخ شمسی، ارقام فارسی، آمار صفحه خانه، دکمه همگام‌سازی لایسنس.
