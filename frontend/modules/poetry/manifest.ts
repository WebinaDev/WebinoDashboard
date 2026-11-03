import type { ModuleManifest } from "@/kernel/types"

/** Opt-in only — never listed in SiteTypeProfiles; enable via ERP feature selection. */
export const poetryManifest: ModuleManifest = {
  slug: "poetry",
  nameFa: "شعر و ادبیات",
  nameEn: "Poetry & Literature",
  siteTypes: [],
  submodules: ["works", "poets", "collections"],
  adminNav: { section: "content", order: 17 },
  adminRoutes: [
    {
      path: "poetry",
      submodule: "works",
      page: "works",
      labelKey: "nav.poetry",
      section: "content",
      order: 17,
      navGroup: "poetry",
      navOrder: 0,
      capability: "content.manage",
    },
  ],
  siteRoutes: [
    { path: "poetry", submodule: "works", labelKey: "site.poetry" },
    { path: "poetry/:slug", submodule: "works", labelKey: "site.poetry_work" },
  ],
}
