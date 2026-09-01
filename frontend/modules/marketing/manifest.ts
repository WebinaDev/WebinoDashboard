import type { ModuleManifest } from "@/kernel/types"

export const marketingManifest: ModuleManifest = {
  slug: "marketing",
  nameFa: "بازاریابی",
  nameEn: "Marketing",
  siteTypes: ["ecommerce", "magazine", "cafe", "corporate"],
  submodules: ["coupons", "campaigns", "newsletter"],
  adminNav: { section: "marketing", order: 40 },
  adminRoutes: [
    { path: "marketing", submodule: "campaigns", labelKey: "nav.marketing", section: "marketing", order: 40 },
  ],
  siteRoutes: [],
}
