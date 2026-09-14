---
id: orders-wallet-pos
title: سفارشات، کیف پول، C2C و صندوق
---

# سفارشات، کیف پول، C2C و صندوق

APIهای احرازهویت‌شده تحت `/api/v1` با گیت زیرماژول‌های commerce: `orders`، `c2c`، `wallet`، `pos`.

## سفارشات (`module:orders`)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/orders` | فیلتر، صفحه‌بندی، `meta.stats` + `status_counts`؛ `?mine=1` |
| GET | `/orders/statuses`، `/orders/filter-options` | |
| POST | `/orders` | Composer / ایجاد توسط کارکنان |
| GET/PATCH/PUT/DELETE | `/orders/{id}` | جزئیات / وضعیت / بازنویسی / soft delete |
| POST | `/orders/bulk` | `change_status` \| `trash` |
| GET/POST | `/orders/{id}/notes` | |
| DELETE | `/order-notes/{id}` | |
| GET/POST | `/orders/{id}/returns` | |
| POST | `/order-returns/{id}/action` | approve/reject/receive/refund |
| GET | `/orders/{id}/print` | HTML رسید + علامت چاپ‌شده |

UI ادمین: `/admin/orders`، `/admin/orders/new`، `/admin/orders/:id`، `/admin/orders/:id/edit`.  
پنل‌های مارکت‌پلیس / تپین / مودیان تا آماده بودن API در UI محصول نمایش داده نمی‌شوند (فقط در مستندات).

## کارت‌به‌کارت (`module:c2c`)

| Method | Path |
|--------|------|
| GET/PUT | `/c2c/settings` |
| GET | `/c2c/receipts` |
| POST | `/c2c/receipts/{order}` | body `{ action: approve\|reject }` |

UI: `/admin/orders/c2c-receipts`، `/admin/settings/c2c`.

## مشتریان (`module:customers`)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/customers` | لیست صفحه‌بندی؛ `?search=` برای کیف پول/POS |
| POST | `/customers` | ایجاد کاربر مشتری |
| PATCH | `/customers/{id}` | به‌روزرسانی |

UI ادمین: `/admin/customers`. تنظیمات کیف پول از `/customers?search=` استفاده می‌کند.

## کیف پول (`module:wallet`)

| Method | Path |
|--------|------|
| GET/PUT | `/wallet/settings` |
| GET | `/wallet/users/{id}` | موجودی + ledger |
| POST | `/wallet/users/{id}/adjust` | credit/debit |
| POST | `/wallet/topup` | شارژ توسط ادمین |
| GET/POST/PATCH | `/wallet/withdrawals` | لیست / درخواست / approve\|paid\|reject |

پورتال کیف پول مشتری نهایی فعلاً خارج از محدوده است. جداول: `wallet_ledger`، `wallet_withdrawals`؛ فیلد `users.wallet_balance_minor`.

UI: `/admin/orders/wallet-withdrawals`، `/admin/settings/wallet`.

## صندوق (`module:pos`)

| Method | Path |
|--------|------|
| GET | `/products/pos-search` |
| GET | `/pos/customers` |
| GET | `/payment-gateways` |
| POST | `/pos/orders` |
| GET | `/pos/orders/{id}/print` |

UI: `/admin/pos`، `/admin/pos/pay-link`، `/admin/pos/my-orders`.

## انواع سایت

- **ecommerce:** orders، c2c، wallet، pos  
- **cafe:** orders، pos  
