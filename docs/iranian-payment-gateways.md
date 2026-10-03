# Iranian payment gateways

Site checkout uses the tenant's own merchant credentials. Platform bills (SMS credit, invoices, marketplace licenses) are charged by ERP. The dashboard only opens a session and reads the result.

## Site commerce

Settings live at **درگاه‌های پرداخت** (`/dashboard/settings/shop/gateways`) for Zarinpal, Snapp Pay, Digipay, and Torob Pay.

- Each gateway has its own enable switch, sandbox or production flag, fee percent, and cash / installment flags.
- Credentials are stored in module settings on the server. The API masks secrets (`has_access_token` and the same pattern for the other secrets).
- Checkout lists a gateway only when it is enabled, configured, and allowed for نقدی or اقساطی.
- Stock and order status move to paid only after the provider verify call succeeds.

Callbacks are `GET /api/v1/payments/callback/{provider}/{order}`.

- Zarinpal `Authority` must equal `payment_intents.meta.zarinpal_authority` for that order. Verify uses the amount stored on the intent.
- Snapp Pay and Torob Pay `paymentToken` must equal the token stored when the intent was created. Snapp Pay is settled after verify. Torob Pay is settled when `settle_enabled` is on.
- Digipay verify uses the stored `providerId` and the returned tracking code. A reported amount that does not match the intent is rejected.
- A bare GET, or another order's authority, does not change the order. Failure is recorded only when the unguessable `nonce` on the callback URL is present, so a leaked StartPay link cannot burn the order.
- The browser return to `/checkout?payment=success` is not what marks the order paid.

Fee percent is shown at checkout. When the fee payer is the customer, that percent is added to the amount sent to the gateway.

## Platform bills (ERP)

Dashboard calls ERP with `WEBINO_ERP_API_TOKEN` (Bearer) plus `X-Tenant-Domain`, `X-Site-Domain`, and `X-Site-Token` when the tenant has a provision token. The same token is used for CRM ticket sync.

| Method | ERP path | Body |
| --- | --- | --- |
| GET | `/api/v1/tenant/billing/outstanding` | query `domain`, `product` |
| POST | `/api/v1/tenant/billing/payments` | `bill_id`, `mode` (`cash` or `installment`), `gateway`, `return_url` |
| GET | `/api/v1/tenant/billing/payments/{id}` | query `domain`, `product` |

`return_url` is set by the dashboard to `{FRONTEND_URL}/dashboard/platform-billing/return?payment={localId}`. The UI polls `GET /api/v1/billing/payments/{localId}` and shows paid only when ERP reports `paid`.

The outstanding payload's `gateways[]` entries have `id`, `label`, `enabled`, `modes`, and `fee_percent`. Disabled gateways are not offered.

Dashboard proxies:

- `GET /api/v1/billing/outstanding`
- `POST /api/v1/billing/payments`
- `GET /api/v1/billing/payments/{id}`

### Environment

```
WEBINO_BASE_URL=https://erp.example
WEBINO_ERP_API_TOKEN=
WEBINO_ERP_BILLING_MODE=auto
WEBINO_ERP_BILLING_STUB_AUTOPAY=false
FRONTEND_URL=https://dashboard.example
```

`WEBINO_ERP_BILLING_MODE`:

- `auto` (default): call ERP when base URL and token are set, otherwise a local fixture.
- `live`: always call ERP. Missing credentials return 503.
- `stub`: fixture bills and gateways, including one disabled gateway, so the UI can be built before ERP is merged.

`WEBINO_ERP_BILLING_STUB_AUTOPAY=true` makes a later status read on the stub flip `pending` to `paid` on the server. The browser query string never does that.
