---
id: store-management
title: Store management API
---

# Store management API

Authenticated admin APIs under `/api/v1` for the commerce shop admin (products, brands, categories, attributes, pricing, marketplace, coffee profile).

All routes require Sanctum auth and the matching submodule activation (`commerce.*` or `coffee-profile.profile`).

## Catalog

| Method | Path | Module gate | Notes |
|--------|------|-------------|-------|
| GET/POST | `/products` | `catalog` | Filters: search, status, type, stock_status, category_id, brand_id |
| GET/PATCH/DELETE | `/products/{id}` | `catalog` | Full product incl. ishop + WFCP fields |
| GET | `/products/lookup` | `catalog` | Categories, brands, tags, attributes, ishop labels |
| POST | `/products/{id}/duplicate` | `catalog` | Draft copy |
| PUT | `/products/{id}/attributes` | `catalog` | Sync attribute pivots |
| PATCH | `/products/bulk` | `catalog` | Cafe-compatible bulk flags |
| CRUD | `/categories` | `catalog` | Hierarchical via `parent_id` |
| CRUD | `/brands` | `brands` | Hierarchical via `parent_id` |
| CRUD | `/attributes` + `/attributes/{id}/terms` | `attributes` | Types: select, color, image, button, text |
| CRUD | `/attribute-groups` | `attributes` | Named attribute presets |

## Variants

| Method | Path | Notes |
|--------|------|-------|
| GET/POST | `/products/{id}/variants` | |
| PATCH/DELETE | `/variants/{id}` | |
| POST | `/products/{id}/variations/generate` | Combination matrix (`dry_run` supported) |
| POST | `/products/{id}/variations/bulk` | Bulk price/stock/purchase |
| POST | `/products/{id}/variations/default` | Set default variation |

## Pricing (WFCP)

| Method | Path | Notes |
|--------|------|-------|
| GET/PUT | `/pricing/settings` | Calculator settings payload |
| POST | `/pricing/calculate` | Derived retail/credit/wholesale/installment |
| POST | `/pricing/quick-add` | Name + purchase → published product |
| GET | `/pricing/bulk-products` | Spreadsheet list |
| PATCH | `/pricing/bulk-products/{id}/*` | purchase-price, wc-price, stock, lock, wholesale-rule |
| PATCH | `/products/{id}/wfcp` | Product editor pricing autosave |
| POST/GET | `/pricing/bulk-price-change/start\|state` | Bulk percent/fixed job |

## Marketplace

| Method | Path | Notes |
|--------|------|-------|
| GET/POST | `/marketplace/products/{id}/maps` | Platforms: digikala, basalam, technolife, tapsishop, snappshop |
| POST | `/marketplace/products/{id}/sync-now` | Push price/stock via adapters |
| POST | `/marketplace/products/{id}/create-remote` | Create remote listing |
| POST | `/marketplace/digikala/products/{id}/map` | Resolve DKP |

Adapters are pluggable via `MarketplaceAdapterRegistry` (default stub adapters).

## Coffee profile (toggleable)

Gate: `coffee_profile` → `coffee-profile.profile`.

| Method | Path |
|--------|------|
| GET/PUT | `/coffee/profile-settings`, `/coffee/pricing-settings`, `/coffee/blend-settings` |
| CRUD | `/coffee/origins` |
| GET/PUT | `/products/{id}/coffee-profile` |
| GET/POST | `/products/{id}/coffee-profile/price-by-attribute` |

## Admin UI routes

| Path | Purpose |
|------|---------|
| `/admin/products` | Product list |
| `/admin/products/new`, `/admin/products/:id` | Product editor (SEO & channel sync slots: coming soon) |
| `/admin/brands`, `/admin/product-categories`, `/admin/attributes` | Taxonomies |
| `/admin/pricing/quick-add`, `bulk-editor`, `price-changer` | WFCP tools |
| `/admin/coffee/settings` | Coffee module settings |
