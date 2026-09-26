# Visual checklist — WP WebinaDashboard ↔ Next (Dashboard + ERP)

Compare light theme side-by-side (Yekan / atmosphere / glass). Pass = same family chrome, not pixel-identical.

## Shared design foundation

| Layer | Source | Status |
|-------|--------|--------|
| OKLCH tokens + glass + atmosphere | `@webina/ui/styles/themes.css` (WP `index.css` port) | Both apps import |
| 13 accents + business glass | `@webina/ui` `accent.ts` | Both apps |
| `data-slot` on card/button/sidebar/input | shadcn primitives | Both apps (enables business glass CSS) |
| Yekan via `--font-yekan` + `--wd-font-*` | `layout` + themes | Both apps |
| Accent picker swatches | AccentMenu / LocaleThemeToolbar | Both apps |

## WebinoDashboard (Next)

| Surface | WP reference | Next route | Check |
|---------|--------------|------------|-------|
| Shell | `DashboardLayout` + `wd-app-atmosphere` | `/admin/*` | Atmosphere main, blurred header, sidebar slots |
| Home | `HomePage` hero/KPI/glass chart | `/admin` | `wd-home-hero`, `variant=stat/glass` |
| Orders list | `OrdersListPage` + `ListStatsStrip` | `/admin/orders` | PageShell, stats, status tabs |
| Order detail | `OrderDetailPage` | `/admin/orders/:id` | Sticky meta; no coming-soon commerce stubs |
| Products list | `ProductsListPage` | `/admin/products` | PageShell, stats, tabs |
| Product editor | `ProductEditorLayout` | `/admin/products/:id` | Sticky sidebar |
| Customers / Staff / RBAC | Users pages | `/admin/customers`, `/staff`, `/users` | Table chrome |
| C2C / Wallet / POS | commerce panels | orders paths + `/admin/pos` | PageShell / dense POS |
| SMS home | SMS panel | `/admin/marketing/sms` | Partial routes only |

## WebinoERP (Next)

| Surface | Target chrome | ERP route | Check |
|---------|---------------|-----------|-------|
| Shell | WP atmosphere + header blur | `/admin/*` | `wd-app-atmosphere`, `h-14 sm:h-16` |
| Home | WP home hero + glass charts | `/admin` | `wd-home-hero`, stat/glass cards |
| CRM Leads | PageShell + stats + glass card | `/admin/crm/leads` | PageShell + ListStatsStrip |
| CRM Tickets | same | `/admin/crm/tickets` | PageShell + ListStatsStrip |
| PM Tasks | glass filter card | `/admin/pm/tasks` | `Card variant=glass` filters |
| Acc Journals | PageShell + glass table | accounting journals | PageShell + glass table card |
| Site Builder control | glass sections | site control panel | `Section` → `variant=glass` |

Nav IA (Dashboard): C2C/wallet under orders; SMS under marketing; cart/checkout `navHidden`.
