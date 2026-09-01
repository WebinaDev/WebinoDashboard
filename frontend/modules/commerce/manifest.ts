import type { ModuleManifest } from "@/kernel/types"

export const commerceManifest: ModuleManifest = {
  slug: "commerce",
  nameFa: "فروش",
  nameEn: "Commerce",
  siteTypes: ["ecommerce", "cafe"],
  submodules: ["catalog", "variants", "cart", "checkout", "orders", "inventory"],
  adminNav: { section: "commerce", order: 20 },
  publicRoutes: ["/shop", "/catalogue"],
  adminRoutes: [
    { path: "catalog", submodule: "catalog", labelKey: "nav.catalog", section: "commerce", order: 20 },
    { path: "cart", submodule: "cart", labelKey: "nav.cart", section: "commerce", order: 21 },
    { path: "checkout", submodule: "checkout", labelKey: "nav.checkout", section: "commerce", order: 22 },
    { path: "orders", submodule: "orders", labelKey: "nav.orders", section: "commerce", order: 23 },
    { path: "inventory", submodule: "inventory", labelKey: "nav.inventory", section: "commerce", order: 24 },
  ],
  siteRoutes: [
    { path: "shop", submodule: "catalog", labelKey: "site.shop" },
    { path: "catalogue", submodule: "catalog", labelKey: "site.catalogue" },
  ],
}
