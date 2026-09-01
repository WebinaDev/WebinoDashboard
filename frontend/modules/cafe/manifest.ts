import type { ModuleManifest } from "@/kernel/types"

export const cafeManifest: ModuleManifest = {
  slug: "cafe",
  nameFa: "کافه",
  nameEn: "Cafe",
  siteTypes: ["cafe"],
  submodules: ["menu", "reservations", "hours", "gallery", "venue"],
  adminNav: { section: "cafe", order: 15 },
  adminRoutes: [
    { path: "menu", submodule: "menu", labelKey: "nav.menu", section: "cafe", order: 15 },
    { path: "hours", submodule: "hours", labelKey: "nav.hours", section: "cafe", order: 16 },
    { path: "gallery", submodule: "gallery", labelKey: "nav.gallery", section: "cafe", order: 17 },
    { path: "venue", submodule: "venue", labelKey: "nav.venue", section: "cafe", order: 18 },
    { path: "reservations", submodule: "reservations", labelKey: "nav.reservations", section: "cafe", order: 19 },
  ],
  siteRoutes: [
    { path: "catalogue", submodule: "menu", labelKey: "site.catalogue" },
    { path: "about", submodule: "venue", labelKey: "site.about" },
    { path: "menu", submodule: "menu", labelKey: "site.menu" },
    { path: "reservations", submodule: "reservations", labelKey: "site.reservations" },
  ],
}
