import type { ModuleManifest } from "@/kernel/types"

export const coffeeProfileManifest: ModuleManifest = {
  slug: "coffee-profile",
  nameFa: "پروفایل قهوه",
  nameEn: "Coffee Profile",
  siteTypes: ["ecommerce", "cafe"],
  submodules: ["profile"],
  adminNav: { section: "commerce", order: 27 },
  adminRoutes: [
    { path: "coffee/settings", submodule: "profile", labelKey: "nav.coffee_profile", section: "commerce", order: 27 },
  ],
  siteRoutes: [],
}
