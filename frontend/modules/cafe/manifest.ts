import type { ModuleManifest } from "@/kernel/types"

export const cafeManifest: ModuleManifest = {
  slug: "cafe",
  nameFa: "کافه",
  nameEn: "Cafe",
  siteTypes: ["cafe"],
  submodules: ["menu", "reservations", "hours", "gallery", "venue", "qr", "engagement", "item"],
  adminNav: { section: "cafe", order: 25 },
  adminRoutes: [
    { path: "gallery", submodule: "gallery", labelKey: "nav.gallery", section: "cafe", order: 25, capability: "catalog.*" },
    { path: "hours", submodule: "hours", labelKey: "nav.hours", section: "cafe", order: 26, capability: "catalog.*" },
    { path: "menu", submodule: "menu", labelKey: "nav.menu", section: "cafe", order: 27, capability: "catalog.*" },
    { path: "qr", submodule: "qr", labelKey: "nav.qr", section: "cafe", order: 28, capability: "catalog.*" },
    { path: "reservations", submodule: "reservations", labelKey: "nav.reservations", section: "cafe", order: 29, capability: "catalog.*" },
    { path: "venue", submodule: "venue", labelKey: "nav.venue", section: "cafe", order: 30, capability: "catalog.*" },
    { path: "kitchen", submodule: "menu", labelKey: "nav.kitchen", section: "cafe", order: 31, capability: "catalog.*" },
    { path: "inbox", submodule: "engagement", labelKey: "nav.inbox", section: "cafe", order: 32, capability: "catalog.*" },
  ],
  siteRoutes: [
    { path: "catalogue", submodule: "menu", labelKey: "site.catalogue" },
    { path: "catalogue/:slug", submodule: "item", labelKey: "site.catalogue_item" },
    { path: "about", submodule: "venue", labelKey: "site.about" },
    { path: "menu", submodule: "menu", labelKey: "site.menu" },
    { path: "reservations", submodule: "reservations", labelKey: "site.reservations" },
  ],
}
