import type { ModuleManifest } from "@/kernel/types"

export const corporateManifest: ModuleManifest = {
  slug: "corporate",
  nameFa: "شرکتی",
  nameEn: "Corporate",
  siteTypes: ["corporate"],
  submodules: ["portfolio", "team", "testimonials", "announcements", "consultations"],
  adminNav: { section: "content", order: 15 },
  adminRoutes: [
    { path: "portfolio", submodule: "portfolio", labelKey: "nav.portfolio", section: "content", order: 15 },
    { path: "team", submodule: "team", labelKey: "nav.team", section: "content", order: 16 },
    { path: "testimonials", submodule: "testimonials", labelKey: "nav.testimonials", section: "content", order: 17 },
    { path: "announcements", submodule: "announcements", labelKey: "nav.announcements", section: "content", order: 18 },
    { path: "consultations", submodule: "consultations", labelKey: "nav.consultations", section: "content", order: 19 },
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
