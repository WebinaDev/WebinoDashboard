import type { ModuleManifest } from "@/kernel/types"

export const cafeManifest: ModuleManifest = {
  slug: "cafe",
  nameFa: "کافه",
  nameEn: "Cafe",
  siteTypes: ["cafe"],
  submodules: ["menu", "reservations", "hours", "gallery", "venue", "qr", "engagement", "item"],
  adminNav: { section: "cafe", order: 25 },
  adminRoutes: [
    { path: "cafe/gallery", submodule: "gallery", labelKey: "nav.gallery", section: "cafe", order: 25, capability: "catalog.*" },
    { path: "cafe/hours", submodule: "hours", labelKey: "nav.hours", section: "cafe", order: 26, capability: "catalog.*" },
    { path: "cafe/menu", submodule: "menu", labelKey: "nav.menu", section: "cafe", order: 27, capability: "catalog.*" },
    { path: "cafe/qr", submodule: "qr", labelKey: "nav.qr", section: "cafe", order: 28, capability: "catalog.*" },
    { path: "cafe/reservations", submodule: "reservations", labelKey: "nav.reservations", section: "cafe", order: 29, capability: "catalog.*" },
    { path: "cafe/venue", submodule: "venue", labelKey: "nav.venue", section: "cafe", order: 30, capability: "catalog.*" },
    // The board a cook works from. This was gated on `catalog.*`, which a cook does not hold
    // — the API allowed `kitchen.view` through but the screen never rendered, so the one role
    // whose entire job is this page could not open it. Any of the kitchen grants opens it, and
    // the API still narrows the tickets to the user's assigned stations.
    { path: "cafe/kitchen", submodule: "menu", page: "kitchen", labelKey: "nav.kitchen", section: "cafe", order: 31, capability: "kitchen.view,kitchen.station,catalog.*", menuKey: "pos" },
    { path: "cafe/inbox", submodule: "engagement", page: "inbox", labelKey: "nav.inbox", section: "cafe", order: 32, capability: "catalog.*" },
    { path: "cafe/pricing", submodule: "menu", page: "pricing", labelKey: "nav.pricing", section: "cafe", order: 33, capability: "catalog.*" },
    // Recipes and plate cost. The menu's price is a guess until somebody knows what the dish
    // costs, so this sits next to pricing rather than inside it.
    { path: "cafe/recipes", submodule: "menu", page: "recipes", labelKey: "nav.recipes", section: "cafe", order: 34, capability: "catalog.*,accounting.manage" },
    // Money reports: P&L with material cost, menu engineering, staff control, AR aging.
    { path: "cafe/reports", submodule: "menu", page: "reports", labelKey: "nav.reports", section: "cafe", order: 35, capability: "reports.shop,accounting.manage,orders.*" },
    // Rota, attendance, leave, contracts and payroll. A staff member can open it to clock in
    // and see their own week; the API narrows the rest.
    { path: "cafe/staff", submodule: "menu", page: "staff", labelKey: "nav.staff", section: "cafe", order: 36, capability: "staff.manage,users.manage,reports.shop,pos.use" },
    // Printing hardware and routing, receipt layout, QR scan analytics, webhooks and API keys.
    // One screen because they are the same job: connecting the shop to the outside world.
    { path: "cafe/settings-integrations", submodule: "menu", page: "settings-integrations", labelKey: "nav.settings_integrations", section: "cafe", order: 37, capability: "settings.manage,branches.manage,reports.shop" },
    // A café already has its price list in a spreadsheet; retyping it one dish at a time is
    // where a migration stops. Upload, map the columns, preview, then commit.
    { path: "cafe/menu-import", submodule: "menu", page: "menu-import", labelKey: "nav.menu_import", section: "cafe", order: 38, capability: "catalog.*" },
    // The stock ledger: waste with a reason, transfers between stores, lots and expiry, and
    // the shopping list built from the reorder points. Every movement posts its value.
    { path: "cafe/stock", submodule: "menu", page: "stock", labelKey: "nav.cafe_stock", section: "cafe", order: 39, capability: "catalog.*,accounting.manage,pos.use" },
    // Cashier till: open/close a shift, reconcile the drawer. Gated on pos.use as well so a
    // cashier account (no catalog.*) can reach it, and managers/accountants can audit it.
    { path: "cafe/pos-shift", submodule: "menu", page: "pos-shift", labelKey: "nav.pos_shift", section: "cafe", order: 34, capability: "pos.use", menuKey: "pos" },
    // Waiter floor board: live per-table state and seat/clean/reserve transitions.
    { path: "cafe/floor", submodule: "menu", page: "floor", labelKey: "nav.cafe_floor", section: "cafe", order: 35, capability: "orders.own", menuKey: "pos" },
    // Courier run sheet: drivers claim a delivery and carry it to the door.
    { path: "cafe/deliveries", submodule: "menu", page: "deliveries", labelKey: "nav.cafe_deliveries", section: "cafe", order: 36, capability: "orders.own", menuKey: "pos" },
    // Manager KPI board: read-only rollup gated on the reporting capability.
    // `homeFor`: a manager signing in should land straight on this board instead of the
    // generic overview, which then competes with it as a second "home".
    { path: "cafe/manager", submodule: "menu", page: "manager", labelKey: "nav.cafe_manager", section: "cafe", order: 37, capability: "reports.shop", menuKey: "pos", homeFor: true },
    // The shift's home screen: prioritized queue + live table map. Every counter role
    // opens this, so its gate accepts any of the operational capabilities.
    { path: "cafe/workbench", submodule: "menu", page: "workbench", labelKey: "nav.cafe_workbench", section: "cafe", order: 24, capability: "pos.use,orders.create,orders.floor,kitchen.view,catalog.*", menuKey: "pos" },
    // The till itself: type, table/guest, items with add-ons, one discount, split payment.
    // `orders.create` alone opens it because a waiter takes orders without holding a drawer.
    { path: "cafe/pos", submodule: "menu", page: "pos", labelKey: "nav.cafe_pos", section: "cafe", order: 23, capability: "pos.use,orders.create", menuKey: "pos" },
    // Multi-branch switchboard: decide whether prices/stock are shared, add branches, and
    // see the sales that went past a branch's stock. `branches.manage` is the owner's and
    // the branch manager's, never a cashier's.
    { path: "cafe/branches", submodule: "menu", page: "branches", labelKey: "nav.cafe_branches", section: "cafe", order: 38, capability: "branches.manage", menuKey: "cafe_branches" },
    // Amending a paid invoice: request a change, a manager approves, then the money moves.
    // The service and its five routes existed with no screen, so the feature was curl-only.
    { path: "cafe/amendments", submodule: "menu", page: "amendments", labelKey: "nav.cafe_amendments", section: "cafe", order: 41, capability: "pos.use,orders.*,accounting.manage", menuKey: "cafe_amendments" },
    // Delivery areas: a fee and a minimum order per district. The table priced nothing until
    // this screen existed — the till stored a zone id and charged the flat fee anyway.
    { path: "cafe/delivery-zones", submodule: "menu", page: "delivery-zones", labelKey: "nav.cafe_delivery_zones", section: "cafe", order: 40, capability: "branches.manage", menuKey: "cafe_delivery_zones" },
    // Kitchen stations: which station prepares which item, and who works which station.
    { path: "cafe/stations", submodule: "menu", page: "stations", labelKey: "nav.cafe_stations", section: "cafe", order: 39, capability: "branches.manage", menuKey: "cafe_stations" },
    // Per-branch price overrides: a chain charges more at one counter than another. The
    // POST/DELETE pair existed since the multi-branch work but nothing could reach it.
    { path: "cafe/branch-prices", submodule: "menu", page: "branch-prices", labelKey: "nav.cafe_branch_prices", section: "cafe", order: 41, capability: "branches.manage", menuKey: "cafe_branch_prices" },
    // Service thresholds: the edit window on a paid order, kitchen warn/late marks, how
    // long a table may sit occupied. Owner-level (`settings.manage`), same as the till's.
    { path: "cafe/operations-settings", submodule: "menu", page: "operations-settings", labelKey: "nav.cafe_operations_settings", section: "cafe", order: 42, capability: "settings.manage", menuKey: "cafe_operations_settings" },
  ],
  siteRoutes: [
    { path: "catalogue", submodule: "menu", labelKey: "site.catalogue" },
    { path: "catalogue/:slug", submodule: "item", labelKey: "site.catalogue_item" },
    { path: "about", submodule: "venue", labelKey: "site.about" },
    { path: "menu", submodule: "menu", labelKey: "site.menu" },
    { path: "reservations", submodule: "reservations", labelKey: "site.reservations" },
  ],
}
