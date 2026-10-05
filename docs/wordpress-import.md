# WordPress / WooCommerce import

Moves a WooCommerce store into the current Webino tenant: products (with variations, attributes, stock, prices, and images), categories, tags, orders, customers, pages, posts, media, navigation, and order stats.

The dashboard does **not** crawl an arbitrary site. That would be an SSRF proxy. Content arrives in one of two ways:

1. The companion WordPress plugin (separate repo) pushes authenticated batches.
2. An operator uploads an export JSON file or a ZIP of JSON files.

Remote image bytes are downloaded only when the job asks for it, and only from the source host plus hosts the operator listed on that job. Private, link-local, and loopback addresses are rejected, and the connection is pinned to the resolved public address.

Domain licensing is unchanged. Do not send license keys or HMAC entitlement codes.

## Dashboard

`/dashboard/import/wordpress` (CMS module).

1. Enter the source URL, for example `https://parisma.ir`. **Check URL** only validates the shape.
2. Set currency and the price multiplier. WooCommerce major-unit prices in `IRT` or `IRR` are stored as whole units. If the source prices are toman and this tenant stores rial, set the multiplier to `10`. A value sent as `price_minor` is stored as-is and is not multiplied.
3. List extra image hosts (CDN) if they differ from the source host. The source host is always allowed. This list is fixed when the job is created; a plugin token cannot widen it later.
4. Leave **Publish products and posts** off for the first pass. Imported products stay hidden and pages, posts, and header/footer changes stay drafts, so the live classic theme is not replaced. Turn it on and run again when the drafts look right. Menus are merged into the header or footer **draft** and are not auto-published.
5. **Dry run** validates and counts rows without writing the catalog.
6. Create the job, upload `export.json` / a ZIP, or let the plugin push batches, then **Continue until finished**. Failures stay on the job; **Retry failures** requeues them. **Pause** stops the next record.

Imported orders keep their WooCommerce date and status. Paid and completed orders show up in the existing sales reports for that period. The job page also shows order count, revenue, and revenue by month for the orders in that job, plus any `stats` snapshots from the export.

## Authentication

Issue a token on the import page. It is a Sanctum personal access token named `wordpress-import:<label>` with the ability `wordpress-import`. The plain token is shown once.

Send it as `Authorization: Bearer <token>` and `Accept: application/json`.

The token can call only `/api/v1/import/wordpress/*`. It cannot read the rest of the admin API or mint another token. Revoke it from the same page.

Dashboard operators use their normal session.

## Endpoints

All routes are under `/api/v1` and require the CMS module.

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| POST | `/import/wordpress/ping` | plugin | Auth check for companion plugin tokens (`{ "ok": true }`). |
| POST | `/import/wordpress/probe` | operator | Validate URL shape. No outbound request. |
| POST | `/import/wordpress/start` | operator or plugin | Create a job. |
| PATCH | `/import/wordpress/jobs/{id}` | operator | Change multiplier, hosts, publish flag, or dry-run (dry-run only before any row is applied). |
| GET | `/import/wordpress/jobs` | operator or plugin | Recent jobs. |
| GET | `/import/wordpress/jobs/{id}` | operator or plugin | Progress, errors, and order stats. |
| POST | `/import/wordpress/jobs/{id}/batches` | operator or plugin | Upsert up to 50 records. Idempotent on `external_id`. |
| POST | `/import/wordpress/ingest` | plugin | Find or create the job for `source_url`, then upsert one batch. |
| POST | `/import/wordpress/jobs/{id}/upload` | operator | JSON body or `file` (`.json` / `.zip`, 20 MB). ZIP needs the PHP zip extension and may hold up to 2000 records. |
| POST | `/import/wordpress/jobs/{id}/run` | operator or plugin | Apply up to `limit` pending records (1–100, default 25). Call again to continue. |
| POST | `/import/wordpress/jobs/{id}/pause` | operator or plugin | Stop before the next record. |
| POST | `/import/wordpress/jobs/{id}/resume` | operator or plugin | Clear pause and run one batch. |
| POST | `/import/wordpress/jobs/{id}/retry` | operator or plugin | Requeue failed records. |
| GET/POST/DELETE | `/import/wordpress/tokens` | operator | List, issue, revoke. |

`wordpress-import:run {jobId} {--limit=50}` loops `run` until the job finishes, pauses, or fails.

Batch rows may send `source_id` as an alias for `external_id` (WordPress plugin exporters). Nested `parent_source_id`, `customer_source_id`, `product_source_id`, and `totals.*` are normalized the same way.

Records are applied in dependency order: media, categories, tags, blog categories and tags, brands, customers, staff, products, coupons, pages, posts, Elementor templates, orders, reviews, menus, redirects, permalinks, settings, waiting list, review queue, then stats. Sending them in one job is enough; a later batch is linked onto rows that were already imported. Re-sending the same `external_id` updates the local row. Variations that disappeared from the payload are removed only when they were created by this importer.

## Batch body

Schema header `X-Webino-Import-Schema: webino.wordpress.import.v1` is optional. An unknown schema is rejected. `X-Webino-Idempotency-Key` on `ingest` and `batches` replays the first successful response and does not enqueue the batch again.

`POST /import/wordpress/ping` advertises every resource the importer accepts. The companion plugin sends an extended resource only after that name appears in `resources`.

`options.resources` selects a subset. Omit it, or send `mode: full`, to import every resource. `mode: selective` requires at least one name. `publish_content` stays false unless the operator turns it on. `GET /import/wordpress/jobs/{id}/queue` lists rows waiting for review. `GET /import/wordpress/permalinks` lists the cutover map.

`resource` accepts the names below. Aliases in parentheses are accepted and stored under the canonical name. `users` stays `customers`. `media_files` is not a separate ingest resource; the plugin checkbox still sends `media`.

| Resource | What is stored |
| --- | --- |
| `media` (`attachments`, `media_files`) | JPEG, PNG, GIF, WebP (8 MB). PDF, MP4, WebM, and SVG use the file path (16 MB). SVG script handlers are stripped. |
| `categories`, `tags` | Product taxonomies, including SEO when present. |
| `brands` (`product_brands`) | Brand terms. Products link with `brand_external_ids`. |
| `blog_categories`, `blog_tags` (`post_tags`) | Blog taxonomies. They are not product tags. |
| `customers` (`users`) | Customers. Random password. `wallet_balance_minor` is copied when sent. |
| `staff` (`staff_users`) | Invite-safe users from `role` or `roles`. `password` is ignored even if `password_exported` is false. `password_must_change` is set. |
| `products` (`woo_products`) | Simple, variable, grouped, external. Downloads, sale dates, upsells, cross-sells, grouped ids. |
| `coupons` (`shop_coupon`) | Draft unless publish is on. `discount_type` may be `percent`, `fixed_cart`, or `fixed_product`. |
| `pages`, `posts` | A builder `document` (version 1) is preferred over Elementor JSON and over `post_content`. Posts keep that document on `builder_draft`; the visual builder opens pages and header/footer templates. |
| `elementor_templates` (`elementor`, `theme_builder`) | Header and footer drafts. Other template types become draft CMS pages so they open in `/dashboard/builder`. |
| `orders` | Line items plus shipping, coupon, fee, and refund lines, and order notes. |
| `reviews` (`comments`, `product_reviews`) | `product_source_id`, `rating`, `content`. Status `1` is approved. |
| `menus` | Flat links in the header or footer **draft**, plus the real tree in CMS menu settings. Not auto-published. |
| `redirects` (`seo_redirects`) | Rank Math / Yoast `from`, `to`, `code`. `source` is the provider name, not the path. Inactive rows are queued. |
| `permalinks` | Old path to the Webino product, page, or post path. Explicit redirects win on the same path. |
| `settings` | Store address, shipping zones, the first tax rate, and payment config with secrets redacted. PWA, notify, brand style, swatches, attribute groups, module flags, and emails are stored on the settings package and queued for review. |
| `waiting_list` (`yith_waitlist`) | YITH rows. No waiting-list model, so they stay on the review queue. |
| `review_queue` | Wallet, ticket, and return rows. Applied when the customer or order link exists; otherwise listed on the review queue. |
| `stats` (`analytics`) | Job snapshots. A `day` (`YYYY-MM-DD`) also upserts analytics daily totals. |
| anything else matching `[a-z0-9_]{1,32}` | Review queue (`needs_mapping`). Not a silent drop. |

```json
{
  "resource": "products",
  "items": [{
    "external_id": "100",
    "source_guid": "https://parisma.ir/product/rose-lipstick",
    "name": "رژ لب رز",
    "slug": "rose-lipstick",
    "sku": "LIP-ROSE",
    "status": "publish",
    "type": "variable",
    "description": "<p>…</p>",
    "short_description": "ماندگاری بالا",
    "regular_price": "120000",
    "sale_price": "99000",
    "currency": "IRT",
    "manage_stock": true,
    "stock_quantity": 14,
    "stock_status": "instock",
    "category_external_ids": ["12"],
    "tag_external_ids": ["3"],
    "images": [{
      "external_id": "501",
      "url": "https://parisma.ir/wp-content/uploads/rose.jpg",
      "alt": "رژ لب رز"
    }],
    "attributes": [{
      "name": "رنگ",
      "slug": "color",
      "visible": true,
      "variation": true,
      "options": [{"name": "رز", "slug": "rose"}]
    }],
    "variations": [{
      "external_id": "101",
      "sku": "LIP-ROSE-1",
      "regular_price": "120000",
      "sale_price": "99000",
      "stock_quantity": 8,
      "manage_stock": true,
      "attributes": {"رنگ": "رز"}
    }]
  }]
}
```

An upload can instead be one object with keys `products`, `categories`, `tags`, `customers`, `orders`, `pages`, `posts`, `media`, `menus`, and `stats`. A sample lives at `backend/tests/Fixtures/wordpress/parisma-sample.json`.

Images may include `data_base64` instead of `url`. That is the preferred plugin path, because the Webino server then does not fetch anything. Raster images are JPEG, PNG, GIF, and WebP, up to 8 MB. HTML is refused. PDF, MP4, WebM, and SVG are stored only when the media row is a file (mime or extension); SVG is sanitized. A URL whose host is not on the job allowlist fails that record and is not stored.

Customers are created with role `customer` and a random password. WordPress password hashes and capabilities are ignored. If the email already belongs to another tenant, the original address is not copied. If it matches a staff user in this tenant, that profile is left unchanged and orders can still link to it.

Order statuses map from WooCommerce (`pending`, `on-hold`, `processing`, `completed`, `cancelled`, `refunded`, `failed`) onto the Webino order statuses. `created_at` / `date_created` is kept so monthly sales reports stay truthful.

Pages become `cms_pages` and open in `/dashboard/builder`. When the plugin sends a builder `document`, that document is stored as the draft. Otherwise `_elementor_data` is converted. Otherwise HTML becomes a heading plus an HTML widget. Unmapped Elementor widgets (tabs, accordion, forms, shortcodes, maps, and the rest) become HTML widgets — `data-webino-unmapped` or `data-widget` — so the page is never blank. They are not native builder blocks. Custom CSS is rewritten from `.elementor-element-{id}` to `.wb-el_{id}` and kept on `document.css`.

Posts become blog posts. Elementor on a post is stored on `builder_draft` and the HTML body is kept. The page builder does not open blog posts.

Menus flatten to `label|/path` lines and are merged into the header or footer builder draft (`location` containing `footer` targets the footer). Existing classic chrome is kept; links are appended.

`stats` items are snapshots on the job (`period`, `orders`, `revenue` or `revenue_minor`). They do not replace the figures computed from imported orders.

## Parisma.ir

Target tenant: `https://parisma.webinaagency.ir` (ecommerce, builder and ecommerce-classic already on main). Source: `https://parisma.ir`.

1. Open `/dashboard/import/wordpress` on the tenant.
2. Source URL `https://parisma.ir`. Currency `IRT` if WooCommerce stores toman. Multiplier `1` for toman-to-toman, or `10` if this tenant's `default_currency` is `IRR`.
3. Add image hosts that are not `parisma.ir` (the uploads CDN, if any).
4. Issue a plugin token. In the companion plugin, set the Webino site URL and the token.
5. Push batches of about 50 records, then call `POST /api/v1/import/wordpress/jobs/{id}/run` until status is `completed`, or upload one export and use **Continue until finished** / `php artisan wordpress-import:run {id}`.
6. Review hidden products, draft pages, and the header draft. Turn on publish and run the job again when the shop should show them. Publish the header from the builder after checking the merged menu.
7. Confirm revenue on the import job and under sales reports for the months those orders were placed.

## Gaps

- No live crawl of WordPress or WooCommerce REST. The plugin or an export has to send the data.
- Unmapped Elementor widgets are HTML fallbacks, not editable native blocks. Tabs, accordions, forms, shortcodes, and maps stay as HTML.
- Blog posts keep a builder document, but `/dashboard/builder` opens CMS pages and header/footer templates only.
- Wallet, ticket, and return rows sent as `review_queue` are applied onto the wallet ledger, support tickets, and order returns when the customer or order is already imported. Rows that cannot be applied stay on the review queue (`needs_mapping`) with payload preview, dismiss, and mark-reviewed. `GET/PATCH /api/v1/import/wordpress/review-queue` and `POST .../apply`.
- YITH waiting lists have no destination model. They stay on that same queue.
- Extra tax rates beyond the first, inactive redirects, and settings slices without a shop field (PWA, notify, brand style, swatches, module flags, emails) are stored on the review queue as `settings_slice`. They are not written into a fake model; an operator dismisses or marks them reviewed.
- Customer and staff passwords cannot be reused. Staff must change the random password. Customers need a password reset or OTP on Webino.
- An email that already exists on another tenant is stored as a placeholder (`@import.webino.invalid`); the original is kept on a customer note.
- Header and footer imports change the draft only.
- With publish left off, products are hidden so they do not appear on the public catalog.
- The dashboard home sales block is the current month. Older Parisma orders appear in order reports for their own dates, and on the import job's stats.
- Remote image download needs PHP curl. ZIP upload needs PHP zip. JSON upload needs neither.
- Downloads follow at most three redirects and re-check the allowlist on each hop.
