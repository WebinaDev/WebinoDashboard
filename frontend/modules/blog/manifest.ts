import type { ModuleManifest } from "@/kernel/types"

export const blogManifest: ModuleManifest = {
  slug: "blog",
  nameFa: "وبلاگ",
  nameEn: "Blog",
  siteTypes: ["ecommerce", "magazine", "cafe", "corporate"],
  submodules: ["posts", "categories"],
  adminNav: { section: "content", order: 13 },
  adminRoutes: [
    {
      path: "blog",
      submodule: "posts",
      page: "posts",
      labelKey: "nav.blog",
      section: "content",
      order: 13,
    },
    {
      path: "blog/new",
      submodule: "posts",
      page: "post-editor",
      labelKey: "nav.blog",
      section: "content",
      order: 13,
      navHidden: true,
    },
    {
      path: "blog/posts/:postId",
      submodule: "posts",
      page: "post-editor",
      labelKey: "nav.blog",
      section: "content",
      order: 13,
      navHidden: true,
    },
  ],
  siteRoutes: [
    { path: "blog", submodule: "posts", labelKey: "site.blog" },
    { path: "blog/:slug", submodule: "posts", labelKey: "site.blog_post" },
  ],
}
