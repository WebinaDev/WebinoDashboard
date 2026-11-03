import type { ModuleManifest } from "@/kernel/types"

/**
 * Courses (دوره‌ها) — standalone admin module.
 * Data still lives in resume APIs; gated via resume.profile (see route-resolver).
 */
export const coursesManifest: ModuleManifest = {
  slug: "courses",
  nameFa: "دوره‌ها",
  nameEn: "Courses",
  siteTypes: ["resume", "corporate", "blog", "magazine"],
  submodules: ["main"],
  adminNav: { section: "courses", order: 17 },
  adminRoutes: [
    {
      path: "courses",
      submodule: "main",
      page: "main",
      labelKey: "nav.courses",
      section: "courses",
      order: 17,
      capability: "content.manage",
      menuKey: "courses",
    },
  ],
  siteRoutes: [],
}
