# Marketplace connector feature matrix (Phase 10.5)

Status relative to WP WebinaDashboard connectors. TARGET implements adapters under `backend/app/Services/Marketplace/`.

| Platform | Auth | Product map | Price/stock sync | Order import | Commission/webhook | Logs | Depth vs WP |
|---|---|---|---|---|---|---|---|
| باسلام (basalam) | OAuth/token | Yes | Yes | Yes | Webhook + pay | Yes | نزدیک — جزئیات غرفه/مالی ناقص جزئی |
| دیجی‌کالا (digikala) | RSA/client | Yes | Yes | Yes | Webhook | Yes | نزدیک — همهٔ انواع job راستی‌آزمایی شود |
| ترب (torob) | Feed + webhook token | Feed | Feed pricing | N/A (clid) | Torob webhook queue | Yes | ناقص — ماتریس Torob-Sync کامل نیست |
| اسنپ‌شاپ | Token API | Generic panel | Partial | Partial | Limited | Shared logger | ناقص — پنل جنریک |
| تپسی‌شاپ | Password/token | Generic | Partial | Partial | Limited | Shared | ناقص |
| تکنولایف | API key | Generic | Partial | Partial | Limited | Shared | ناقص |
| ایمالز | Feed | Feed | Feed | N/A | N/A | Shared | ناقص جزئی |
| ذره‌بین | Feed | Feed | Feed | N/A | N/A | Shared | ناقص جزئی |
| اسنپ‌پی‌سرچ | Feed | Feed | Feed | N/A | N/A | Shared | ناقص جزئی |

## Shared `wnc-core` equivalents in TARGET

| WP wnc-core concern | TARGET |
|---|---|
| HTTP client + retry | `MarketplaceHttp` |
| Logger | `MarketplaceLogger` |
| Adapter registry | `MarketplaceAdapterRegistry` |
| Order normalize/import | `OrderNormalizer`, `MarketplaceOrderImporter` |
| Pricing overlay | `MarketplacePricing` |
| Settings secrets | `MarketplaceSettingsService` |
| Feed catalog | `FeedCatalog` |

## Remaining gaps (ERP / deeper work)

1. Full job-type parity for Digikala (all WP job kinds).
2. Dedicated deep panels for SnappShop / TapsiShop / Technolife (today generic `MarketplacePlatformPanel`).
3. Torob sync matrix (full attribute/category mapping tools).
4. Live commission settlement UIs beyond stored settings.
5. Purchase/callback for module marketplace (Phase 11 / ERP).
