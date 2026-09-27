import type { ModuleManifest } from "@/kernel/types"

export const cmsManifest: ModuleManifest = {
  slug: "cms",
  nameFa: "محتوا",
  nameEn: "CMS",
  siteTypes: ["ecommerce", "magazine", "cafe", "resume", "corporate"],
  submodules: ["pages", "menus", "seo"],
  adminNav: { section: "content", order: 12 },
  adminRoutes: [
    {
      path: "pages",
      submodule: "pages",
      page: "pages",
      labelKey: "nav.cms_pages",
      section: "content",
      order: 12,
    },
    {
      path: "cms",
      submodule: "pages",
      page: "pages",
      labelKey: "nav.cms_pages",
      section: "content",
      order: 12,
      navHidden: true,
    },
    {
      path: "pages/new",
      submodule: "pages",
      page: "page-editor",
      labelKey: "nav.cms_pages",
      section: "content",
      order: 12,
      navHidden: true,
    },
    {
      path: "pages/:pageId",
      submodule: "pages",
      page: "page-editor",
      labelKey: "nav.cms_pages",
      section: "content",
      order: 12,
      navHidden: true,
    },
  ],
  siteRoutes: [
    { path: "pages/:slug", submodule: "pages", labelKey: "site.pages" },
  ],
}
