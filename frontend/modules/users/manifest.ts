import type { ModuleManifest } from "@/kernel/types"

export const usersManifest: ModuleManifest = {
  slug: "users",
  nameFa: "کاربران",
  nameEn: "Users",
  siteTypes: ["ecommerce", "magazine", "corporate"],
  submodules: ["customers", "staff", "rbac", "subscribers"],
  adminNav: { section: "access", order: 30 },
  adminRoutes: [
    { path: "users", submodule: "rbac", labelKey: "nav.users", section: "access", order: 30 },
    { path: "customers", submodule: "customers", labelKey: "nav.customers", section: "access", order: 31 },
  ],
  siteRoutes: [],
}
