/**
 * The admin sidebar blueprint.
 *
 * The nav used to be derived purely from manifest `section` / `navGroup` fields, which
 * produced 15 flat sections, showed accounting twice (once from the ERP module, once from
 * commerce's till ledger) and ordered everything by whatever `order` number a manifest
 * happened to pick. A cashier scrolling to find the till had to walk past 40 links.
 *
 * This file is now the single source of truth for **what the sidebar looks like**:
 * group order, grouping, icons, role visibility and default-open behaviour. The manifests
 * keep owning the routes themselves (path, page file, capabilities) — the blueprint only
 * says where an already-enabled route is displayed.
 *
 * Two rules make it safe:
 *  - A blueprint entry whose route is not enabled (or not declared at all yet) renders
 *    nothing, so listing a planned page here is harmless.
 *  - Any enabled route the blueprint does not claim falls through to the legacy
 *    manifest-derived grouping, so site types this blueprint was not written for
 *    (resume, blog, poetry, courses) keep working unchanged.
 */

import type { DashboardRole } from "@/components/PermissionGate"

/** Coarse audiences, so role rules read as intent instead of role lists everywhere. */
export type NavAudience = "operations" | "manager" | "accounting" | "content" | "everyone"

/** Café counter staff: they run a shift, they do not run the business. */
const COUNTER: DashboardRole[] = ["cashier", "waiter", "cook"]

/** Everyone who signs into a dashboard rather than the customer portal. */
const ALL_STAFF: DashboardRole[] = [
  "admin",
  "owner",
  "staff",
  "shop_manager",
  "branch_manager",
  "seller",
  "accountant",
  "author",
  "editor",
  "cashier",
  "waiter",
  "cook",
]

export const NAV_AUDIENCE_ROLES: Record<NavAudience, DashboardRole[]> = {
  // Barista-to-owner: the people who work a service.
  operations: ["cashier", "waiter", "cook", "branch_manager", "shop_manager", "admin", "owner", "staff"],
  manager: ["branch_manager", "shop_manager", "admin", "owner"],
  accounting: ["accountant", "branch_manager", "shop_manager", "admin", "owner", "staff"],
  content: ["author", "editor", "shop_manager", "admin", "owner", "staff"],
  everyone: ALL_STAFF,
}

export type BlueprintEntry =
  | {
      /** Dashboard route path exactly as a manifest declares it (`""` is the dashboard root). */
      path: string
      /** Restrict this single link further than its group. Omit to inherit the group. */
      roles?: DashboardRole[]
      /**
       * Inverse of `roles`: show the link to everyone in the group *except* these roles.
       * Used where one role is the exception rather than the rule — a cook belongs in the
       * kitchen, not on the workbench or the order board.
       */
      hideFrom?: DashboardRole[]
    }
  | {
      /**
       * A nested collapsible collecting every enabled route under these prefixes. Used for
       * deep trees (SMS panel, page builder, bots) that would otherwise dump 14 links into
       * the group.
       */
      subtree: string
      labelKey: string
      prefixes: string[]
      roles?: DashboardRole[]
      /** See the leaf variant. */
      hideFrom?: DashboardRole[]
    }

export type BlueprintGroup = {
  key: string
  labelKey: string
  order: number
  /** Key into `GROUP_ICONS` (see nav-icons.ts). */
  icon: string
  /** Lower sorts first in the mobile quick-access row. Omit to leave out of it. */
  mobilePriority?: number
  collapsible: boolean
  /** Audiences that may see the group at all. */
  audiences: NavAudience[]
  /** Audiences for which the group starts expanded. Ignored when not collapsible. */
  defaultOpenFor?: NavAudience[]
  /** Ordered links. Anything the group's `absorb` prefixes catch is appended after these. */
  entries: BlueprintEntry[]
  /**
   * Route-path prefixes belonging to this domain that the blueprint does not list
   * explicitly. They are appended (in manifest order) so no enabled page disappears.
   */
  absorb?: string[]
  /**
   * When set, the absorbed routes are gathered into a single nested sub-menu with this
   * label instead of being appended flat. Keeps a group's top level scannable: the
   * blueprint's own links stay visible, and everything secondary is one row away.
   */
  absorbAs?: string
}

export const NAV_BLUEPRINT: BlueprintGroup[] = [
  {
    key: "overview",
    labelKey: "nav.section_overview",
    order: 0,
    icon: "overview",
    collapsible: false,
    audiences: ["everyone"],
    entries: [{ path: "" }],
  },

  {
    key: "daily",
    labelKey: "nav.section_daily",
    order: 5,
    icon: "daily",
    mobilePriority: 0,
    collapsible: true,
    // A shift starts here, so the group is already open when the drawer opens.
    defaultOpenFor: ["operations"],
    audiences: ["operations"],
    entries: [
      { path: "cafe/pos" },
      { path: "cafe/workbench", hideFrom: ["cook"] },
      { path: "cafe/order-board", hideFrom: ["cook"] },
      // The cook's whole dashboard. Every other daily link is withheld from the kitchen.
      { path: "cafe/kitchen", roles: ["cook", "branch_manager", "shop_manager", "admin", "owner", "staff"] },
      { path: "cafe/pos-shift" },
      { path: "cafe/deliveries" },
      { path: "cafe/reservations" },
      { path: "cafe/amendments" },
      // Commerce's own till and order screens are enabled on café tenants too. They are not
      // duplicates of the café pages (different data, different screens), so they stay in the
      // daily drawer — but folded into two rows, because five flat shop links after eight
      // café ones is exactly the clutter this group exists to remove.
      { subtree: "shop_orders", labelKey: "nav.group_orders", prefixes: ["orders"] },
      { subtree: "shop_till", labelKey: "nav.group_pos", prefixes: ["pos"] },
    ],
  },

  {
    key: "menu",
    labelKey: "nav.section_menu",
    order: 10,
    icon: "menu",
    mobilePriority: 2,
    collapsible: true,
    // Counter staff read the menu; they do not reprice it.
    audiences: ["operations", "manager", "content"],
    entries: [
      { path: "cafe/menu" },
      {
        path: "cafe/recipes",
        roles: ["branch_manager", "shop_manager", "admin", "owner", "staff"],
      },
      {
        path: "cafe/menu-import",
        roles: ["branch_manager", "shop_manager", "admin", "owner", "staff"],
      },
      { path: "cafe/floor" },
      { path: "cafe/hours" },
      { path: "cafe/serving-windows" },
      { path: "cafe/qr" },
      { path: "cafe/gallery" },
      {
        path: "cafe/pricing",
        roles: ["branch_manager", "shop_manager", "admin", "owner", "staff"],
      },
      {
        path: "cafe/branch-prices",
        roles: ["branch_manager", "shop_manager", "admin", "owner", "staff"],
      },
      { path: "cafe/venue" },
      // Catalogue *maintenance* — brands, attributes, bulk price lists. A cashier reads the
      // menu; they do not restructure the catalogue, on a café or on a shop.
      {
        subtree: "shop_catalog",
        labelKey: "nav.group_shop",
        prefixes: ["products", "brands", "product-categories", "attributes", "pricing", "product-catalog"],
        roles: ["branch_manager", "shop_manager", "admin", "owner", "staff", "seller"],
      },
    ],
  },

  {
    key: "stock",
    labelKey: "nav.section_stock",
    order: 15,
    icon: "stock",
    collapsible: true,
    audiences: ["manager"],
    entries: [
      { path: "cafe/stock" },
      // Purchasing, waste and re-order suggestions have no page yet. Listing them here means
      // the link appears the moment a manifest declares the route — no sidebar edit needed.
      { path: "cafe/purchases", roles: ["branch_manager", "shop_manager", "admin", "owner", "staff"] },
      { path: "cafe/waste", roles: ["branch_manager", "shop_manager", "admin", "owner", "staff"] },
      { path: "cafe/purchase-suggestions", roles: ["branch_manager", "shop_manager", "admin", "owner", "staff"] },
    ],
  },

  {
    key: "finance",
    labelKey: "nav.section_finance",
    order: 20,
    icon: "finance",
    collapsible: true,
    // One group for money. Commerce's till ledger used to render a second accounting block.
    audiences: ["accounting"],
    entries: [
      { path: "accounting" },
      { path: "accounting/invoices" },
      { path: "accounting/supplier-bills" },
      { path: "accounting/receipts" },
      { path: "accounting/cash-accounts" },
      { path: "accounting/treasury" },
      { path: "accounting/checks" },
      { path: "accounting/cheque-books" },
      { path: "accounting/reconciliation" },
      { path: "accounting/expenses" },
      { path: "accounting/persons" },
      { path: "accounting/parties" },
      { path: "accounting/chart" },
      { path: "accounting/journals" },
      { path: "accounting/ledger" },
      { path: "accounting/fixed-assets" },
      { path: "accounting/reports" },
      { path: "accounting/fiscal-year" },
      { path: "accounting/settings" },
    ],
    // Catches the rest of the ledger — including `accounting/warehouses`. The warehouse
    // page reads like a stock screen, but it is an `accounting/*` route: filing it under
    // «انبار و خرید» would split the ledger across two groups and put two near-identically
    // named stock links side by side.
    absorb: ["accounting/"],
    absorbAs: "nav.group_accounting_more",
  },

  {
    key: "reports",
    labelKey: "nav.section_reports",
    order: 25,
    icon: "reports",
    mobilePriority: 1,
    collapsible: true,
    audiences: ["accounting", "manager"],
    entries: [
      { path: "cafe/manager" },
      { path: "cafe/reports" },
      { path: "reports/overview" },
      { path: "analytics/overview" },
      { path: "cafe/staff-performance" },
      { subtree: "shop_reports", labelKey: "nav.group_shop_reports", prefixes: ["reports/"] },
      { subtree: "analytics", labelKey: "nav.group_analytics", prefixes: ["analytics/"] },
    ],
  },

  {
    key: "staff",
    labelKey: "nav.section_staff",
    order: 30,
    icon: "staff",
    collapsible: true,
    audiences: ["manager"],
    entries: [{ path: "cafe/staff" }, { path: "cafe/schedule" }],
  },

  {
    key: "marketing",
    labelKey: "nav.section_marketing",
    order: 35,
    icon: "marketing",
    collapsible: true,
    audiences: ["manager", "content"],
    entries: [
      { path: "marketing/customer-return" },
      { path: "marketing/coupons" },
      { path: "marketing/coupon-builder" },
      {
        subtree: "sms",
        labelKey: "nav.group_sms",
        prefixes: ["marketing/sms"],
      },
      { subtree: "link_hub", labelKey: "nav.group_link_hub", prefixes: ["link-hub"] },
      { path: "marketing/bot-campaigns" },
      { path: "marketing" },
    ],
    absorb: ["marketing/"],
  },

  {
    key: "content",
    labelKey: "nav.section_content",
    order: 40,
    icon: "content",
    collapsible: true,
    audiences: ["content", "manager"],
    entries: [
      { subtree: "media", labelKey: "nav.group_media", prefixes: ["media"] },
      { path: "magazine" },
      { path: "pages" },
      { path: "builder/collections" },
      { path: "menus" },
      { path: "testimonials" },
      { path: "cafe/inbox" },
      { subtree: "blog", labelKey: "nav.group_blog", prefixes: ["blog"] },
      { subtree: "poetry", labelKey: "nav.group_poetry", prefixes: ["poetry"] },
      { subtree: "magazine_tree", labelKey: "nav.group_magazine", prefixes: ["magazine/"] },
      // Résumé keeps its own 14-page tree; flattening it into this group would be a
      // regression for résumé tenants.
      { subtree: "resume", labelKey: "nav.group_resume", prefixes: ["resume"] },
    ],
    absorb: [
      "academy",
      "portfolio",
      "team",
      "announcements",
      "consultations",
      "courses",
      "users/comments",
      "theme-display",
      "stats",
      "highlight-stats",
    ],
  },

  {
    key: "tools",
    labelKey: "nav.section_tools",
    order: 45,
    icon: "tools",
    collapsible: true,
    audiences: ["manager", "content"],
    entries: [
      { path: "notifications" },
      { subtree: "page_builder", labelKey: "nav.group_page_builder", prefixes: ["builder", "theme-builder"] },
      { subtree: "bots", labelKey: "nav.group_bots", prefixes: ["bots"] },
    ],
    absorb: ["ai-content"],
  },

  {
    key: "admin",
    labelKey: "nav.section_admin",
    order: 50,
    icon: "admin",
    collapsible: true,
    audiences: ["manager"],
    entries: [
      { path: "cafe/branches" },
      { path: "cafe/stations" },
      { path: "cafe/delivery-zones" },
      { path: "cafe/settings-integrations" },
      { path: "cafe/operations-settings" },
      { path: "settings/shop/general" },
      { path: "settings/shop/marketplace" },
      { path: "modules/catalog" },
      { path: "settings/site/security" },
      { subtree: "settings", labelKey: "nav.group_settings", prefixes: ["settings/", "platform-billing"] },
      { subtree: "marketplace", labelKey: "nav.group_marketplace", prefixes: ["modules"] },
      { subtree: "users", labelKey: "nav.group_users", prefixes: ["users", "customers", "staff", "rbac", "tickets", "support", "activity"] },
    ],
    absorb: ["coffee", "account", "settings/c2c", "settings/wallet", "inventory"],
    absorbAs: "nav.group_admin_more",
  },
]

/** Groups ordered for display. */
export function orderedBlueprintGroups(): BlueprintGroup[] {
  return [...NAV_BLUEPRINT].sort((a, b) => a.order - b.order)
}

/** Groups that feed the mobile quick-access row, best-first. */
export function mobilePriorityGroups(): BlueprintGroup[] {
  return NAV_BLUEPRINT.filter((g) => typeof g.mobilePriority === "number").sort(
    (a, b) => (a.mobilePriority ?? 99) - (b.mobilePriority ?? 99),
  )
}

export function audienceRoles(audiences: NavAudience[]): Set<string> {
  const out = new Set<string>()
  for (const a of audiences) for (const r of NAV_AUDIENCE_ROLES[a]) out.add(r)
  return out
}

/**
 * The parts of a group the role rules read. `buildAdminNav` hands sections back in this
 * shape (an `AdminNavSection`), so the helpers accept it structurally instead of demanding
 * a full `BlueprintGroup` — the resolver has already dropped `entries` by then.
 */
export type NavGroupShape = {
  collapsible?: boolean
  audiences?: NavAudience[]
  defaultOpenFor?: NavAudience[]
}

/** True when `role` may see `group`. An unknown/empty role sees nothing but `everyone` groups. */
export function groupVisibleForRole(group: NavGroupShape, role: string | undefined | null): boolean {
  const audiences = group.audiences ?? []
  if (!role) return audiences.includes("everyone")
  return audienceRoles(audiences).has(role)
}

/** True when `role` may see `entry`, given the group it lives in. */
export function entryVisibleForRole(
  entry: BlueprintEntry,
  group: NavGroupShape,
  role: string | undefined | null,
): boolean {
  if (!entry.roles) return true
  if (!role) return false
  return entry.roles.includes(role as DashboardRole) && groupVisibleForRole(group, role)
}

/** True when `group` should start expanded for `role`. */
export function groupDefaultOpenForRole(
  group: NavGroupShape,
  role: string | undefined | null,
): boolean {
  if (group.collapsible === false) return true
  if (!group.defaultOpenFor) return false
  if (!role) return group.defaultOpenFor.includes("everyone")
  return audienceRoles(group.defaultOpenFor).has(role)
}

/** Roles that work a counter, exported for callers that need the distinction. */
export const COUNTER_ROLES: readonly string[] = COUNTER
