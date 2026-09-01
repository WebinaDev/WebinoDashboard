import type { ModuleManifest } from "@/kernel/types"

export const magazineManifest: ModuleManifest = {
  slug: "magazine",
  nameFa: "مجله",
  nameEn: "Magazine",
  siteTypes: ["magazine"],
  submodules: ["issues", "articles", "series", "authors"],
  adminNav: { section: "site", order: 12 },
  adminRoutes: [
    { path: "magazine", submodule: "articles", labelKey: "nav.magazine", section: "site", order: 12 },
  ],
  siteRoutes: [
    { path: "magazine", submodule: "articles", labelKey: "site.magazine" },
    { path: "magazine/:slug", submodule: "articles", labelKey: "site.magazine_article" },
  ],
}
