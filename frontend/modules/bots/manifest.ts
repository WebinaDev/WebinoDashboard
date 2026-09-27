import type { ModuleManifest } from "@/kernel/types"

export const botsManifest: ModuleManifest = {
  slug: "bots",
  nameFa: "ربات‌ها",
  nameEn: "Bots",
  siteTypes: ["ecommerce", "cafe", "corporate"],
  submodules: ["bale", "telegram"],
  adminNav: { section: "tools", order: 62 },
  adminRoutes: [
    { path: "bots/bale", submodule: "bale", page: "bale", labelKey: "nav.bot_bale", section: "tools", order: 62, navGroup: "bots", navOrder: 0 },
    { path: "bots/telegram", submodule: "telegram", page: "telegram", labelKey: "nav.bot_telegram", section: "tools", order: 62, navGroup: "bots", navOrder: 1 },
  ],
  siteRoutes: [],
}
