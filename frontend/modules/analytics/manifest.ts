import type { ModuleManifest } from "@/kernel/types"

const ANALYTICS_SECTIONS = [
  "overview",
  "visitors",
  "pages",
  "referrals",
  "geo",
  "devices",
  "commerce",
  "compare",
  "seo",
  "support",
  "content",
  "month-summary",
] as const

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
  adminNav: { section: "overview", order: 5 },
  adminRoutes: [
    ...ANALYTICS_SECTIONS.map((section, i) => ({
      path: `analytics/${section}`,
      submodule: "overview",
      page: "analytics-shell",
      labelKey: `nav.analytics_${section.replace(/-/g, "_")}`,
      section: "overview",
      order: 5,
      navGroup: "analytics",
      navOrder: i,
    })),
    ...REPORT_SECTIONS.map((section, i) => ({
      path: `reports/${section}`,
      submodule: "reports",
      page: "shop-reports-shell",
      labelKey: `nav.reports_${section}`,
      section: "overview",
      order: 6,
      navGroup: "shop_reports",
      navOrder: i,
    })),
  ],
  siteRoutes: [],
}
