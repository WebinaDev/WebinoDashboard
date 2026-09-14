# Visual checklist — WP WebinaDashboard ↔ Next WebinoDashboard

Compare light theme side-by-side (Yekan / atmosphere). Pass = same family chrome, not pixel-identical.

| Surface | WP reference | Next route | Check |
|---------|--------------|------------|-------|
| Orders list | `OrdersListPage` + `ListStatsStrip` + status tabs | `/admin/orders` | PageShell, stats strip, status tabs, collapsible filters, table |
| Order detail | `OrderDetailPage` panels | `/admin/orders/:id` | Contact bar, items, notes/returns, sticky meta sidebar; no Marketplace/Tapin/Moadian coming-soon cards |
| Products list | `ProductsListPage` | `/admin/products` | PageShell, stats, status tabs, filters, table (no disabled coming-soon action icons) |
| Product editor | `ProductEditorLayout` | `/admin/products/:id` | Main column + sticky sidebar (publish / categories / brands / tags / image); SEO tab omitted |
| Customers | `UsersListPage` | `/admin/customers` | Table + create/edit form |
| Staff | Users employees | `/admin/staff` | Table + create/edit + role |
| RBAC | roles UI | `/admin/users` | Role counts + assign by user id |
| C2C receipts | `C2CReceiptsPage` gallery | `/admin/orders/c2c-receipts` | Status tabs + thumbnail cards |
| Wallet withdrawals | wallet list | `/admin/orders/wallet-withdrawals` | PageShell + status tabs + table |
| SMS home | SMS panel | `/admin/marketing/sms` | Partial live routes only; no claim of full WP parity |
| POS | `PosSimplePage` | `/admin/pos` | Dense full-bleed two-column layout |

Nav IA: C2C/wallet under orders paths; SMS under marketing; cart/checkout `navHidden` from admin sidebar.
