import type { ModuleManifest } from "@/kernel/types"

export const cmsManifest: ModuleManifest = {
  slug: "cms",
  nameFa: "محتوا",
  nameEn: "CMS",
  siteTypes: ["ecommerce", "magazine", "cafe", "resume", "corporate"],
  submodules: ["pages", "menus", "seo"],
  adminNav: { section: "content", order: 12 },
  adminRoutes: [
    { path: "cms", submodule: "pages", labelKey: "nav.cms", section: "content", order: 12 },
  ],
  siteRoutes: [
    { path: "pages/:slug", submodule: "pages", labelKey: "site.pages" },
  ],
}
