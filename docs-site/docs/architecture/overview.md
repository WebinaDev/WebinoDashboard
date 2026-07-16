# Architecture overview

Webino Dashboard is the customer-facing multi-tenant product in the Webina suite.

- **API-first** under `/api/v1/*`
- **Modules** via `TenantModule` / `module:{slug}` middleware (documented Architecture §4.1 exception — not nwidart)
- **Provisioning** and license sync with WebinoERP and WebinoServerManager (HMAC `X-Webino-Signature`)

See the suite Architecture document in `WebinoDocs/Architecture.md` for cross-product standards.
