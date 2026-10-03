import type { ModuleManifest } from "@/kernel/types"

export const botsManifest: ModuleManifest = {
  slug: "bots",
  nameFa: "ربات‌ها",
  nameEn: "Bots",
  siteTypes: ["ecommerce", "cafe", "corporate"],
  submodules: ["bale", "telegram"],
  adminNav: { section: "tools", order: 62 },
  adminRoutes: [
    { path: "bots/bale", submodule: "bale", page: "bale", labelKey: "nav.bot_bale", section: "tools", order: 62, navGroup: "bots", navOrder: 0, capability: "marketing.*" },
    { path: "bots/telegram", submodule: "telegram", page: "telegram", labelKey: "nav.bot_telegram", section: "tools", order: 62, navGroup: "bots", navOrder: 1, capability: "marketing.*" },
    { path: "bots/bale/logs", submodule: "bale", page: "bot-logs", labelKey: "nav.bot_bale", section: "tools", order: 62, navHidden: true },
    { path: "bots/bale/coupons", submodule: "bale", page: "bot-coupons", labelKey: "nav.bot_bale", section: "tools", order: 62, navHidden: true },
    { path: "bots/telegram/logs", submodule: "telegram", page: "bot-logs", labelKey: "nav.bot_telegram", section: "tools", order: 62, navHidden: true },
    { path: "bots/telegram/coupons", submodule: "telegram", page: "bot-coupons", labelKey: "nav.bot_telegram", section: "tools", order: 62, navHidden: true },
  ],
  siteRoutes: [],
}
