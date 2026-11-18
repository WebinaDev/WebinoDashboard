import type { ModuleManifest } from "@/kernel/types"

/**
 * Theme & display (تم و نمایش) — standalone admin module.
 * Settings still use resume APIs; gated via resume.profile (see route-resolver).
 */
export const themeDisplayManifest: ModuleManifest = {
  slug: "theme-display",
  nameFa: "تم و نمایش",
  nameEn: "Theme & display",
  siteTypes: ["resume", "corporate", "blog", "magazine"],
  submodules: ["main"],
  adminNav: { section: "theme_display", order: 19 },
  adminRoutes: [
    {
      path: "theme-display",
      submodule: "main",
      page: "main",
      labelKey: "nav.theme_display",
      section: "theme_display",
      order: 19,
      capability: "content.manage",
      menuKey: "theme-display",
    },
  ],
  siteRoutes: [],
}
