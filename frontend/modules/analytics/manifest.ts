import type { ModuleManifest } from "@/kernel/types"

export const analyticsManifest: ModuleManifest = {
  slug: "analytics",
  nameFa: "تحلیل",
  nameEn: "Analytics",
  siteTypes: ["ecommerce", "magazine", "cafe", "corporate"],
  submodules: ["overview", "reports"],
  adminNav: { section: "overview", order: 5 },
  adminRoutes: [
    { path: "reports", submodule: "reports", labelKey: "nav.reports", section: "overview", order: 5 },
  ],
  siteRoutes: [],
}
