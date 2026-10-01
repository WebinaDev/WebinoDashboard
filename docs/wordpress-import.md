# WordPress import (scaffold)

This is the entry point for a later migration plugin. The current API does **not** download a remote site (no outbound fetch, so it cannot be used as an SSRF proxy) and does not copy content.

## Dashboard

`/dashboard/import/wordpress`

- **Probe** `POST /api/v1/import/wordpress/probe` with `{ "source_url": "https://shop.example" }`
- **Start** `POST /api/v1/import/wordpress/start` stores a job with status `scaffold`
- **List** `GET /api/v1/import/wordpress/jobs`
- **Show** `GET /api/v1/import/wordpress/jobs/{id}`

Authenticated routes require the CMS module. Responses name the resources a future plugin should send:

- `woo_products` — WooCommerce products, variations, categories, and images metadata
- `pages` — WordPress pages, mapped onto builder documents when the block structure is known
- `posts` — posts into the magazine/blog modules
- `media` — files into the media library
- `menus` — navigation into header template links

## Future plugin

A small WordPress plugin (separate repo) should authenticate as a Webino user and push those resources in batches. Suggested flow:

1. Site admin installs the plugin and pastes the Webino site URL plus an API token.
2. Plugin exports Woo products, pages, posts, media, and menus.
3. Webino stores them with the existing catalog, CMS, and builder APIs.
4. The operator reviews drafts in the page builder before publish.

Do not send license or HMAC entitlement codes. Domain identity stays on the Webino tenant.
