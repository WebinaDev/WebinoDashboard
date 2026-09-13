import type { ModuleManifest } from "@/kernel/types"

export const botsManifest: ModuleManifest = {
  slug: "bots",
  nameFa: "ربات‌ها",
  nameEn: "Bots",
  siteTypes: ["ecommerce", "cafe", "corporate"],
  submodules: ["bale", "telegram"],
  adminNav: { section: "bots", order: 41 },
  adminRoutes: [
    { path: "bots/bale", submodule: "bale", page: "bale", labelKey: "nav.bot_bale", section: "bots", order: 41 },
    { path: "bots/telegram", submodule: "telegram", page: "telegram", labelKey: "nav.bot_telegram", section: "bots", order: 42 },
  ],
  siteRoutes: [],
}
