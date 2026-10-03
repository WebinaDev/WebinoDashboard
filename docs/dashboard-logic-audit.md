# Dashboard logic audit

Status after the logic-audit pass. Each item is fixed in this branch.

## Phase 1

1. **Fixed.** Public catalog, cart, and guest cafe only accept `publish` products that are visible and available. Draft, private, and trash stay off the storefront.
2. **Fixed.** Stock drops when an order first becomes a sale (`OrderReports::salesStatuses()`, including `paid` and cafe `processing`) and is restored on cancel, failure, or refund. Cafe table checkout is confirmed as `processing`.
3. **Fixed.** Coupons are held at checkout (`coupon_redemptions` counts toward the limit under a row lock) and `usage_count` increments only after a successful sale. The hold is released on cancel or failed payment.
4. **Fixed.** `POST /api/v1/account/wallet/topup` no longer credits a balance. Wallet checkout debits the customer, and refunds credit the same wallet once.
5. **Fixed.** Customer ticket paths stay on `/dashboard/account/tickets`. The legacy redirect into the staff inbox was removed.
6. **Fixed.** The subscriber role includes `account.portal`, so the account portal abilities match the portal role.

## Phase 2

7. **Fixed.** Storefront, checkout, and guest cafe use `Product::storefrontPriceMinor` (sale window, otherwise discount off the regular price) and the same tax helper.
8. **Fixed.** Shipping quotes use real product and variant weights. A zero shipping total is rejected unless the method is free shipping, local pickup, or a free-shipping rule.
9. **Fixed.** `OrderStatusService` is the status writer. Bulk, Tapin, and card-to-card updates cannot move a cancelled or refunded order back into a sale.
10. **Fixed.** A full refund sets status `refunded` and restores outstanding stock. A partial refund keeps the order status, records `partial_refund_minor`, and restores only the returned quantities. Finance reports count returns in status `refunded` only.
11. **Fixed.** Coupon apply rejects a future `scheduled_at` and requires the password when visibility is `password`.
12. **Fixed.** Bulk price percent and fixed changes apply from the stored base price, skip trash, remember the applied signature, and hold the lock for 55 minutes.

## Phase 3

13. **Fixed.** Staff APIs for catalog, orders, wallet, coupons, content, tickets, payments, and coffee require capabilities, not only a sidebar check.
14. **Fixed.** Coffee profile routes and the coffee nav item stay available only when the tenant site type is `coffee`.
15. **Fixed.** Builder delete soft-trashes pages. Publish is blocked while status is trash. Single and bulk trash keep the previous status for restore. Magazine categories have trash and restore, and trashing a category cascades to its children.

## Phase 4

16. **Fixed.** The Jalali date picker reopens an ISO date as a Gregorian value before converting. Order amount filters and coffee bean prices parse Persian digits.
17. **Fixed.** Home recent orders use the same sale statuses as the orders summary.
18. **Fixed.** License sync stays clickable when the status request fails. It is disabled only while the sync itself is running.
19. **Fixed.** Quick-add uses the shop default currency.
20. **Fixed.** Impersonation stamps ERP staff id and name onto order status history and notes when that identity is present. Password changes, password resets, and two-factor enable, confirm, and disable are blocked during impersonation. The impersonation bar can still browse.
