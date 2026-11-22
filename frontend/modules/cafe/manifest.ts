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
    { path: "cafe/kitchen", submodule: "menu", page: "kitchen", labelKey: "nav.kitchen", section: "cafe", order: 31, capability: "catalog.*" },
    { path: "cafe/inbox", submodule: "engagement", page: "inbox", labelKey: "nav.inbox", section: "cafe", order: 32, capability: "catalog.*" },
    { path: "cafe/pricing", submodule: "menu", page: "pricing", labelKey: "nav.pricing", section: "cafe", order: 33, capability: "catalog.*" },
    // Cashier till: open/close a shift, reconcile the drawer. Gated on pos.use as well so a
    // cashier account (no catalog.*) can reach it, and managers/accountants can audit it.
    { path: "cafe/pos-shift", submodule: "menu", page: "pos-shift", labelKey: "nav.pos_shift", section: "cafe", order: 34, capability: "pos.use", menuKey: "pos" },
    // Waiter floor board: live per-table state and seat/clean/reserve transitions.
    { path: "cafe/floor", submodule: "menu", page: "floor", labelKey: "nav.cafe_floor", section: "cafe", order: 35, capability: "orders.own", menuKey: "pos" },
    // Courier run sheet: drivers claim a delivery and carry it to the door.
    { path: "cafe/deliveries", submodule: "menu", page: "deliveries", labelKey: "nav.cafe_deliveries", section: "cafe", order: 36, capability: "orders.own", menuKey: "pos" },
    // Manager KPI board: read-only rollup gated on the reporting capability.
    { path: "cafe/manager", submodule: "menu", page: "manager", labelKey: "nav.cafe_manager", section: "cafe", order: 37, capability: "reports.shop", menuKey: "pos" },
  ],
  siteRoutes: [
    { path: "catalogue", submodule: "menu", labelKey: "site.catalogue" },
    { path: "catalogue/:slug", submodule: "item", labelKey: "site.catalogue_item" },
    { path: "about", submodule: "venue", labelKey: "site.about" },
    { path: "menu", submodule: "menu", labelKey: "site.menu" },
    { path: "reservations", submodule: "reservations", labelKey: "site.reservations" },
  ],
}
