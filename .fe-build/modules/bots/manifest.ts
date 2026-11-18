import type { ModuleManifest } from "@/kernel/types"

import { BOT_PLATFORMS } from "./lib/platforms"
import { BOT_SECTIONS, botSectionHref } from "./lib/sections"

const SECTION_PAGES = BOT_SECTIONS.map((s) => s.id)

function platformRoutes() {
  const routes: ModuleManifest["adminRoutes"] = [
    {
      path: "bots",
      submodule: "hub",
      page: "bots-hub",
      labelKey: "nav.section_bots",
      section: "tools",
      order: 61,
      navGroup: "bots",
      navOrder: 0,
      capability: "marketing.*",
    },
  ]

  let order = 1
  for (const p of BOT_PLATFORMS) {
    const live = p.live
    routes.push({
      path: `bots/${p.id}`,
      submodule: p.id,
      page: live ? (p.id === "bale" || p.id === "telegram" ? p.id : "bot-workspace") : "bot-workspace",
      labelKey: `nav.bot_${p.id}`,
      section: "tools",
      order: 62,
      navGroup: "bots",
      navOrder: order++,
      capability: "marketing.*",
      ...(live ? {} : { navHidden: true }),
    })

    for (const section of SECTION_PAGES) {
      if (section === "overview") continue
      const page =
        section === "logs"
          ? "bot-logs"
          : section === "coupons"
            ? "bot-coupons"
            : "bot-workspace"
      routes.push({
        path: botSectionHref(p.id, section),
        submodule: p.id,
        page,
        labelKey: `nav.bot_${p.id}`,
        section: "tools",
        order: 62,
        navHidden: true,
        capability: "marketing.*",
      })
    }
  }

  return routes
}

export const botsManifest: ModuleManifest = {
  slug: "bots",
  nameFa: "ربات‌ها",
  nameEn: "Bots",
  siteTypes: ["ecommerce", "cafe", "corporate"],
  submodules: ["hub", ...BOT_PLATFORMS.map((p) => p.id)],
  adminNav: { section: "tools", order: 61 },
  adminRoutes: platformRoutes(),
  siteRoutes: [],
}
