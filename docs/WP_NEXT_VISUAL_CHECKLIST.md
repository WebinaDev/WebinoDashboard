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
| Shell | `DashboardLayout` + `wd-app-atmosphere` | `/dashboard/*` | Atmosphere main, blurred header, sidebar slots |
| Home | `HomePage` hero/KPI/glass chart | `/dashboard` | `wd-home-hero`, `variant=stat/glass` |
| Orders list | `OrdersListPage` + `ListStatsStrip` | `/dashboard/orders` | PageShell, stats, status tabs |
| Order detail | `OrderDetailPage` | `/dashboard/orders/:id` | Sticky meta; no coming-soon commerce stubs |
| Products list | `ProductsListPage` | `/dashboard/products` | PageShell, stats, tabs |
| Product editor | `ProductEditorLayout` | `/dashboard/products/:id` | Sticky sidebar |
| Customers / Staff / RBAC | Users pages | `/dashboard/customers`, `/staff`, `/users` | Table chrome |
| C2C / Wallet / POS | commerce panels | orders paths + `/dashboard/pos` | PageShell / dense POS |
| SMS home | SMS panel | `/dashboard/marketing/sms` | Partial routes only |

## WebinoERP (Next)

| Surface | Target chrome | ERP route | Check |
|---------|---------------|-----------|-------|
| Shell | WP atmosphere + header blur | `/dashboard/*` | `wd-app-atmosphere`, `h-14 sm:h-16` |
| Home | WP home hero + glass charts | `/dashboard` | `wd-home-hero`, stat/glass cards |
| CRM Leads | PageShell + stats + glass card | `/dashboard/crm/leads` | PageShell + ListStatsStrip |
| CRM Tickets | same | `/dashboard/crm/tickets` | PageShell + ListStatsStrip |
| PM Tasks | glass filter card | `/dashboard/pm/tasks` | `Card variant=glass` filters |
| Acc Journals | PageShell + glass table | accounting journals | PageShell + glass table card |
| Site Builder control | glass sections | site control panel | `Section` → `variant=glass` |

Nav IA (Dashboard): C2C/wallet under orders; SMS under marketing; cart/checkout `navHidden`.
