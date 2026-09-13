---
id: orders-wallet-pos
title: Orders, wallet, C2C & POS
---

# Orders, wallet, C2C & POS

Authenticated APIs under `/api/v1` gated by commerce submodules `orders`, `c2c`, `wallet`, `pos`.

## Orders (`module:orders`)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/orders` | Filters, pagination, `meta.stats` + `status_counts`; `?mine=1` |
| GET | `/orders/statuses`, `/orders/filter-options` | |
| POST | `/orders` | Composer / staff create |
| GET/PATCH/PUT/DELETE | `/orders/{id}` | Detail / status / full rewrite / soft delete |
| POST | `/orders/bulk` | `change_status` \| `trash` |
| GET/POST | `/orders/{id}/notes` | |
| DELETE | `/order-notes/{id}` | |
| GET/POST | `/orders/{id}/returns` | |
| POST | `/order-returns/{id}/action` | approve/reject/receive/refund |
| GET | `/orders/{id}/print` | Receipt HTML + mark printed |

Admin UI: `/admin/orders`, `/admin/orders/new`, `/admin/orders/:id`, `/admin/orders/:id/edit`.  
Marketplace / Tapin / Moadian panels are **coming soon** placeholders on the detail page.

## C2C (`module:c2c`)

| Method | Path |
|--------|------|
| GET/PUT | `/c2c/settings` |
| GET | `/c2c/receipts` |
| POST | `/c2c/receipts/{order}` | body `{ action: approve\|reject }` |

UI: `/admin/orders/c2c-receipts`, `/admin/settings/c2c`.

## Wallet (`module:wallet`)

| Method | Path |
|--------|------|
| GET/PUT | `/wallet/settings` |
| GET | `/wallet/users/{id}` | balance + ledger |
| POST | `/wallet/users/{id}/adjust` | credit/debit |
| POST | `/wallet/topup` | staff credit |
| GET/POST/PATCH | `/wallet/withdrawals` | list / request / approve\|paid\|reject |

Customer account portal UI is deferred. Tables: `wallet_ledger`, `wallet_withdrawals`; `users.wallet_balance_minor`.

UI: `/admin/orders/wallet-withdrawals`, `/admin/settings/wallet`.

## POS (`module:pos`)

| Method | Path |
|--------|------|
| GET | `/products/pos-search` |
| GET | `/pos/customers` |
| GET | `/payment-gateways` |
| POST | `/pos/orders` |
| GET | `/pos/orders/{id}/print` |

UI: `/admin/pos`, `/admin/pos/pay-link`, `/admin/pos/my-orders`.

## Site types

- **ecommerce:** orders, c2c, wallet, pos  
- **cafe:** orders, pos  
