import type { ModuleManifest } from "@/kernel/types"

const TRAFFIC_SECTIONS = [
  "overview",
  "visitors",
  "pages",
  "referrals",
  "geo",
  "devices",
  "online",
  "commerce",
  "compare",
  "month-summary",
] as const

const PERFORMANCE_SECTIONS = ["seo", "support", "content"] as const

const REPORT_SECTIONS = [
  "overview",
  "revenue",
  "orders",
  "products",
  "variations",
  "categories",
  "coupons",
  "taxes",
  "customers",
  "downloads",
  "stock",
  "sales",
  "financial",
] as const

export const analyticsManifest: ModuleManifest = {
  slug: "analytics",
  nameFa: "تحلیل",
  nameEn: "Analytics",
  siteTypes: ["ecommerce", "magazine", "cafe", "corporate"],
  submodules: ["overview", "reports"],
  adminNav: { section: "reports", order: 70 },
  adminRoutes: [
    ...TRAFFIC_SECTIONS.map((section, i) => ({
      path: `analytics/${section}`,
      submodule: "overview",
      page: "analytics-shell",
      labelKey: `nav.analytics_${section.replace(/-/g, "_")}`,
      section: "reports",
      order: 70,
      navGroup: "analytics",
      navOrder: i,
      capability: "analytics.view",
    })),
    ...PERFORMANCE_SECTIONS.map((section, i) => ({
      path: `analytics/${section}`,
      submodule: "overview",
      page: "analytics-shell",
      labelKey: `nav.analytics_${section}`,
      section: "reports",
      order: 72,
      navGroup: "performance",
      navOrder: i,
      capability: "analytics.view",
    })),
    ...REPORT_SECTIONS.map((section, i) => ({
      path: `reports/${section}`,
      submodule: "reports",
      page: "shop-reports-shell",
      labelKey: `nav.reports_${section}`,
      section: "reports",
      order: 71,
      navGroup: "shop_reports",
      navOrder: i,
      capability: "reports.shop",
    })),
  ],
  siteRoutes: [],
}
