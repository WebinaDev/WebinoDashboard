import type { ModuleManifest } from "@/kernel/types"

export const usersManifest: ModuleManifest = {
  slug: "users",
  nameFa: "کاربران",
  nameEn: "Users",
  siteTypes: ["ecommerce", "magazine", "corporate", "cafe"],
  submodules: ["customers", "staff", "rbac", "subscribers", "tickets"],
  adminNav: { section: "users", order: 50 },
  adminRoutes: [
    { path: "users", submodule: "rbac", labelKey: "nav.users", section: "users", order: 50 },
    { path: "customers", submodule: "customers", labelKey: "nav.customers", section: "users", order: 51, navHidden: true },
    { path: "staff", submodule: "staff", labelKey: "nav.staff", section: "users", order: 52, navHidden: true },
    {
      path: "tickets",
      submodule: "tickets",
      page: "tickets",
      labelKey: "nav.tickets",
      section: "users",
      order: 53,
    },
    {
      path: "tickets/:ticketId",
      submodule: "tickets",
      page: "ticket-detail",
      labelKey: "nav.tickets",
      section: "users",
      order: 53,
    },
    {
      path: "support",
      submodule: "tickets",
      page: "support-inbox",
      labelKey: "nav.online_support",
      section: "users",
      order: 54,
    },
  ],
  siteRoutes: [],
}
