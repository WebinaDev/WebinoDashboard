import type { ModuleManifest } from "@/kernel/types"

/**
 * Opt-in only — never listed in SiteTypeProfiles; enable via ERP feature selection.
 * Admin UI for poems lives on blog.poetry (`modules/blog/manifest.ts` → `/dashboard/poetry`).
 * Do not re-declare that path here: a second adminRoutes entry created a duplicate sidebar
 * group titled the raw key `nav.group_poetry` (no i18n) alongside the translated `nav.poetry`.
 */
export const poetryManifest: ModuleManifest = {
  slug: "poetry",
  nameFa: "شعر و ادبیات",
  nameEn: "Poetry & Literature",
  siteTypes: [],
  submodules: ["works", "poets", "collections"],
  adminNav: { section: "content", order: 17 },
  adminRoutes: [],
  siteRoutes: [
    { path: "poetry", submodule: "works", labelKey: "site.poetry" },
    { path: "poetry/:slug", submodule: "works", labelKey: "site.poetry_work" },
  ],
}
