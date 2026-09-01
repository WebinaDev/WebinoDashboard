import type { ModuleManifest } from "@/kernel/types"

export const academyManifest: ModuleManifest = {
  slug: "academy",
  nameFa: "آکادمی",
  nameEn: "Academy",
  siteTypes: ["magazine", "corporate"],
  submodules: ["courses", "lessons"],
  adminNav: { section: "site", order: 13 },
  adminRoutes: [
    { path: "academy", submodule: "courses", labelKey: "nav.academy", section: "site", order: 13 },
  ],
  siteRoutes: [
    { path: "academy", submodule: "courses", labelKey: "site.academy" },
    { path: "academy/:slug", submodule: "courses", labelKey: "site.academy_course" },
  ],
}
