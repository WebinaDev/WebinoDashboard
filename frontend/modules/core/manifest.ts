import type { ModuleManifest } from "@/kernel/types"

const coreRoutes = (sub: string, labelKey: string, section = "core", order = 0) => ({
  path: sub === "dashboard" ? "" : sub,
  submodule: sub,
  labelKey,
  section,
  order,
})

export const coreManifest: ModuleManifest = {
  slug: "core",
  nameFa: "هسته",
  nameEn: "Core",
  siteTypes: ["ecommerce", "magazine", "cafe", "resume", "corporate"],
  submodules: ["auth", "setup", "tenant", "dashboard", "settings", "media", "i18n", "modules", "themes"],
  adminNav: { section: "core", order: 0 },
  adminRoutes: [
    coreRoutes("dashboard", "nav.dashboard", "overview", 0),
    coreRoutes("themes", "nav.themes", "site", 8),
    coreRoutes("settings", "nav.settings", "access", 90),
    {
      path: "settings/site/:section",
      submodule: "settings",
      page: "settings",
      labelKey: "nav.settings",
      section: "access",
      order: 90,
      navHidden: true,
    },
    {
      path: "settings/shop/:section",
      submodule: "settings",
      page: "settings",
      labelKey: "nav.settings",
      section: "access",
      order: 90,
      navHidden: true,
    },
    {
      path: "settings/shop/:section/:sub",
      submodule: "settings",
      page: "settings",
      labelKey: "nav.settings",
      section: "access",
      order: 90,
      navHidden: true,
    },
    coreRoutes("modules", "nav.modules", "access", 91),
    coreRoutes("media", "nav.media", "site", 15),
  ],
  siteRoutes: [],
}
