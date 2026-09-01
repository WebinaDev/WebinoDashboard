import type { ModuleManifest } from "@/kernel/types"

export const corporateManifest: ModuleManifest = {
  slug: "corporate",
  nameFa: "شرکتی",
  nameEn: "Corporate",
  siteTypes: ["corporate"],
  submodules: ["portfolio", "team", "testimonials", "announcements", "consultations"],
  adminNav: { section: "site", order: 14 },
  adminRoutes: [
    { path: "portfolio", submodule: "portfolio", labelKey: "nav.portfolio", section: "site", order: 14 },
    { path: "team", submodule: "team", labelKey: "nav.team", section: "site", order: 15 },
    { path: "testimonials", submodule: "testimonials", labelKey: "nav.testimonials", section: "site", order: 16 },
    { path: "announcements", submodule: "announcements", labelKey: "nav.announcements", section: "site", order: 17 },
    { path: "consultations", submodule: "consultations", labelKey: "nav.consultations", section: "site", order: 18 },
  ],
  siteRoutes: [
    { path: "portfolio", submodule: "portfolio", labelKey: "site.portfolio" },
    { path: "portfolio/:slug", submodule: "portfolio", labelKey: "site.portfolio_item" },
    { path: "team", submodule: "team", labelKey: "site.team" },
    { path: "testimonials", submodule: "testimonials", labelKey: "site.testimonials" },
    { path: "announcements", submodule: "announcements", labelKey: "site.announcements" },
    { path: "consultation", submodule: "consultations", labelKey: "site.consultation" },
  ],
}
