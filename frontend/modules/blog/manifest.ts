import type { ModuleManifest } from "@/kernel/types"

export const blogManifest: ModuleManifest = {
  slug: "blog",
  nameFa: "مجله",
  nameEn: "Magazine",
  siteTypes: ["ecommerce", "magazine", "cafe", "corporate", "coffee", "blog"],
  submodules: ["posts", "categories"],
  adminNav: { section: "content", order: 11 },
  adminRoutes: [
    {
      path: "blog",
      submodule: "posts",
      page: "posts",
      labelKey: "nav.blog",
      section: "content",
      order: 11,
      navGroup: "blog",
      navOrder: 0,
      capability: "content.manage",
    },
    {
      path: "blog/categories",
      submodule: "categories",
      page: "categories",
      labelKey: "nav.blog_categories",
      section: "content",
      order: 11,
      navGroup: "blog",
      navOrder: 1,
      capability: "content.manage",
    },
    {
      // Poetry admin (poems, stanzas/refrains, taxonomies, Telegram import). Poetry is a core backend
      // feature (/api/v1/poetry/*, content.manage); visibility is gated in isSubmoduleEnabled (blog.poetry).
      path: "poetry",
      submodule: "poetry",
      page: "poetry",
      labelKey: "nav.poetry",
      section: "content",
      order: 12,
      capability: "content.manage",
    },
    {
      path: "blog/new",
      submodule: "posts",
      page: "post-editor",
      labelKey: "nav.blog",
      section: "content",
      order: 11,
      navHidden: true,
      capability: "content.manage",
    },
    {
      path: "blog/posts/:postId",
      submodule: "posts",
      page: "post-editor",
      labelKey: "nav.blog",
      section: "content",
      order: 11,
      navHidden: true,
      capability: "content.manage",
    },
  ],
  siteRoutes: [
    { path: "blog", submodule: "posts", labelKey: "site.blog" },
    { path: "blog/:slug", submodule: "posts", labelKey: "site.blog_post" },
  ],
}
