import type { ModuleManifest } from "@/kernel/types"

export const blogManifest: ModuleManifest = {
  slug: "blog",
  nameFa: "وبلاگ",
  nameEn: "Blog",
  siteTypes: ["ecommerce", "magazine", "cafe", "corporate"],
  submodules: ["posts", "categories"],
  adminNav: { section: "site", order: 11 },
  adminRoutes: [
    { path: "blog", submodule: "posts", labelKey: "nav.blog", section: "site", order: 11 },
  ],
  siteRoutes: [
    { path: "blog", submodule: "posts", labelKey: "site.blog" },
    { path: "blog/:slug", submodule: "posts", labelKey: "site.blog_post" },
  ],
}
