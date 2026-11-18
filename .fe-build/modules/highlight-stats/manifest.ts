import type { ModuleManifest } from "@/kernel/types"

/**
 * Highlight stats (آمار) — standalone admin module for portfolio counters.
 * Data still lives in resume APIs; gated via resume.profile (see route-resolver).
 */
export const highlightStatsManifest: ModuleManifest = {
  slug: "highlight-stats",
  nameFa: "آمار",
  nameEn: "Stats",
  siteTypes: ["resume", "corporate", "blog", "magazine"],
  submodules: ["main"],
  adminNav: { section: "stats", order: 18 },
  adminRoutes: [
    {
      path: "stats",
      submodule: "main",
      page: "main",
      labelKey: "nav.highlight_stats",
      section: "stats",
      order: 18,
      capability: "content.manage",
      menuKey: "stats",
    },
  ],
  siteRoutes: [],
}
