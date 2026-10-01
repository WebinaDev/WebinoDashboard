# License identity = domain (+ product)

## Contract (ERP)

- **Entitlement lookup:** `domain` + optional `product` (slug). No license code.
- **HMAC (service auth only):** canonical payload `domain|{product}|ts`.
  - Legacy WP / old Dashboard signatures `domain|{license_key}|ts` still verify; `license_key` is **ignored** for entitlement.
  - If WP posts `license_key` that looks like a hostname and `domain` is empty, it is treated as domain.
- **Endpoints:** `POST /api/webinocrm/v1/license/check|activate|module-clone-url` (and marketplace / ledger / ModirPayamak compat).
- **Activate body:** `domain` required; `product` optional (default `webino` / `webinodashboard`); `license_key` optional deprecated.

## DB

- Column `core_licenses.product` (default `webino`); unique `(domain, product)`.
- Column `license_key` **deprecated** — filled with internal placeholder `dom:{domain}[:product]` for unique/compat only. Not shown in UI; not required from clients.

## WP license-management

Old WordPress WebinaDashboard / license-management clients may still POST `license_key`. ERP accepts the field for HMAC/compat, maps domain from `domain` (or Host / domain-like key), and checks status by domain + product.
