import type { ModuleManifest } from "@/kernel/types"

export const magazineManifest: ModuleManifest = {
  slug: "magazine",
  nameFa: "مجله",
  nameEn: "Magazine",
  siteTypes: ["magazine"],
  submodules: ["issues", "articles", "series", "authors"],
  adminNav: { section: "content", order: 10 },
  adminRoutes: [
    { path: "magazine", submodule: "articles", labelKey: "nav.magazine", section: "content", order: 10 },
  ],
  siteRoutes: [
    { path: "magazine", submodule: "articles", labelKey: "site.magazine" },
    { path: "magazine/:slug", submodule: "articles", labelKey: "site.magazine_article" },
  ],
}
