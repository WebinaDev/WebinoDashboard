import { MODULE_MANIFESTS } from "./registry"
import { orderedBlueprintGroups, type NavAudience } from "./nav-blueprint"
import type { ResolvedAdminRoute, ResolvedSiteRoute, TenantActivation } from "./types"
import { DASHBOARD_BASE, dashboardPath } from "./paths"

function activationKey(module: string, sub: string) {
  return `${module}.${sub}`
}

/** True when any submodule of `moduleSlug` is enabled for the tenant (generic module gate). */
export function isModuleEnabled(activations: TenantActivation[], moduleSlug: string): boolean {
  if (moduleSlug === "core") return true
  return activations.some((a) => a.module_slug === moduleSlug && a.enabled)
}

export function isSubmoduleEnabled(
  activations: TenantActivation[],
  moduleSlug: string,
  submoduleSlug: string,
  options?: { ignoreLicense?: boolean },
): boolean {
  if (moduleSlug === "core") return true

  // Domain entitlement is not a per-module code. A `licensed: false` row from a
  // failed or mismatched ERP sync must not hide admin nav. Public site routes
  // keep the license bit (ignoreLicense omitted).
  const ignoreLicense = options?.ignoreLicense === true
  const enabled = (mod: string, sub: string) =>
    activations.some(
      (a) =>
        a.module_slug === mod &&
        a.submodule_slug === sub &&
        a.enabled &&
        (ignoreLicense || a.licensed !== false),
    )

  // SMS API is gated by sms-panel.panel; nav lives under marketing.sms — accept either.
  if (moduleSlug === "marketing" && submoduleSlug === "sms") {
    return enabled("sms-panel", "panel") || enabled("marketing", "sms")
  }

  if (moduleSlug === "marketing" && submoduleSlug === "sale-prices") {
    return (
      enabled("marketing", "sale-prices") ||
      enabled("commerce", "catalog") ||
      enabled("marketing", "coupons")
    )
  }

  if (moduleSlug === "marketing" && submoduleSlug === "notifications") {
    return (
      enabled("marketing", "notifications") ||
      enabled("marketing", "coupons") ||
      enabled("commerce", "catalog")
    )
  }

  if (moduleSlug === "users" && submoduleSlug === "tickets") {
    return (
      enabled("users", "tickets") ||
      enabled("users", "rbac") ||
      enabled("commerce", "orders")
    )
  }

  // The activity log was added after tenants were provisioned, so no tenant has a
  // `users.personnel` row yet. Whoever can audit staff/roles/permissions can also read
  // the trail; the `activity.view` capability still decides who sees the menu entry.
  if (moduleSlug === "users" && submoduleSlug === "personnel") {
    return (
      enabled("users", "personnel") ||
      enabled("users", "rbac") ||
      enabled("users", "staff")
    )
  }

  // Cafe (and older tenants) often lack users.* activation rows even though staff
  // must manage buyers. Treat commerce catalog/orders/pos as implying customers/staff.
  if (moduleSlug === "users" && (submoduleSlug === "customers" || submoduleSlug === "staff")) {
    return (
      enabled("users", submoduleSlug) ||
      enabled("users", "rbac") ||
      enabled("commerce", "orders") ||
      enabled("commerce", "catalog") ||
      enabled("commerce", "pos")
    )
  }

  // Item pages (/catalogue/:slug) were added to the cafe manifest after tenants were provisioned, so
  // older tenants have no `cafe.item` activation row and every item link 404'd. The menu implies them.
  if (moduleSlug === "cafe" && submoduleSlug === "item") {
    return enabled("cafe", "item") || enabled("cafe", "menu")
  }

  // Poetry is ERP opt-in only. Never imply it from blog.posts or resume — that made
  // «شعر و ادبیات» appear on every storefront/resume site. Require blog.poetry or any
  // enabled poetry.* activation (seeded when the poetry addon is licensed).
  if (moduleSlug === "blog" && submoduleSlug === "poetry") {
    return (
      enabled("blog", "poetry") ||
      activations.some(
        (a) =>
          a.module_slug === "poetry" &&
          a.enabled &&
          (ignoreLicense || a.licensed !== false),
      )
    )
  }

  if (moduleSlug === "commerce" && submoduleSlug === "accounting") {
    return (
      enabled("commerce", "accounting") ||
      enabled("commerce", "catalog") ||
      enabled("commerce", "orders")
    )
  }

  // The full ledger's submodules were seeded together, but a tenant that only has
  // some rows (older backfill, partial toggle) must still see the whole section.
  // Any enabled accounting submodule implies the rest, matching the backend's
  // module-level fallback in EnsureModuleEnabled.
  if (moduleSlug === "accounting") {
    return (
      enabled("accounting", submoduleSlug) ||
      activations.some(
        (a) =>
          a.module_slug === "accounting" &&
          a.enabled &&
          (ignoreLicense || a.licensed !== false),
      )
    )
  }

  if (moduleSlug === "commerce" && submoduleSlug === "account") {
    return (
      enabled("commerce", "account") ||
      enabled("commerce", "orders") ||
      enabled("commerce", "cart") ||
      enabled("commerce", "checkout")
    )
  }

  // Courses / highlight stats / theme-display were split out of Resume IA but still
  // share resume data + resume.profile activation (no separate ERP rows required).
  if (
    (moduleSlug === "courses" ||
      moduleSlug === "highlight-stats" ||
      moduleSlug === "theme-display") &&
    submoduleSlug === "main"
  ) {
    return enabled("resume", "profile") || enabled(moduleSlug, submoduleSlug)
  }

  return enabled(moduleSlug, submoduleSlug)
}


/**
 * The activated route that claims `/dashboard` as the tenant's landing screen (`homeFor`).
 *
 * Kept out of {@see resolveAdminRoute} on purpose: that resolver must never consult
 * activations, because an empty payload there once 404'd every dashboard page. Here the
 * worst case is a null return, and the caller falls back to the generic overview.
 *
 * Manifest order decides ties: earlier modules win, matching the sidebar build order.
 */
export function resolveHomeRoute(activations: TenantActivation[]): ResolvedAdminRoute | null {
  for (const mod of MODULE_MANIFESTS) {
    for (const route of mod.adminRoutes) {
      if (!route.homeFor) continue
      if (!isSubmoduleEnabled(activations, mod.slug, route.submodule)) continue
      return {
        ...route,
        moduleSlug: mod.slug,
        fullPath: DASHBOARD_BASE,
      }
    }
  }
  return null
}

/**
 * Match a dashboard pathname to a manifest route.
 *
 * Activation and license flags are intentionally ignored. An empty activations
 * payload (API down, anonymous SSR, or a domain-license sync that cleared
 * `licensed`) used to return null, and `renderAdminPage` turned that into
 * Next.js notFound for every non-core screen. Only a path that is not in any
 * manifest is missing. Sidebar visibility still uses `isSubmoduleEnabled`.
 */
export function resolveAdminRoute(segments: string[]): ResolvedAdminRoute | null {
  if (segments.length === 0) {
    return {
      moduleSlug: "core",
      path: "",
      submodule: "dashboard",
      labelKey: "nav.dashboard",
      section: "overview",
      order: 0,
      fullPath: DASHBOARD_BASE,
    }
  }

  const path = segments.join("/")

  // Prefer exact path matches before dynamic `:param` routes.
  for (const mod of MODULE_MANIFESTS) {
    for (const route of mod.adminRoutes) {
      if (route.path !== path) continue
      return {
        ...route,
        moduleSlug: mod.slug,
        fullPath: dashboardPath(path),
      }
    }
  }

  for (const mod of MODULE_MANIFESTS) {
    for (const route of mod.adminRoutes) {
      if (!route.path.includes(":")) continue
      const params = matchDynamicParams(route.path, path)
      if (!params) continue
      return {
        ...route,
        moduleSlug: mod.slug,
        fullPath: dashboardPath(path),
        params,
      }
    }
  }

  return null
}

export function resolveSiteRoute(
  segments: string[],
  activations: TenantActivation[],
): ResolvedSiteRoute | null {
  if (segments.length === 0) {
    return {
      moduleSlug: "core",
      path: "",
      submodule: "dashboard",
      labelKey: "site.home",
      fullPath: "/",
    }
  }

  const path = segments.join("/")

  for (const mod of MODULE_MANIFESTS) {
    for (const route of mod.siteRoutes) {
      const params = matchDynamicParams(route.path, path)
      if (route.path === path || params) {
        // Several modules may claim the same public path (`/catalogue` exists in both cafe
        // and commerce). A disabled claim must fall through to the next module instead of
        // 404ing the path outright, otherwise enabling only one module hides the page.
        if (!isSubmoduleEnabled(activations, mod.slug, route.submodule)) {
          continue
        }
        return {
          ...route,
          moduleSlug: mod.slug,
          fullPath: `/${path}`,
          params: params ?? undefined,
        }
      }
    }
  }

  return null
}

/** True when some module declares a site route for this path (ignores activation). */
export function matchesSiteRoute(segments: string[]): boolean {
  const path = segments.join("/")
  return MODULE_MANIFESTS.some((mod) => mod.siteRoutes.some((route) => route.path === path || matchDynamicParams(route.path, path) !== null))
}

/**
 * Builder pages are also served at the root (/<slug>, as in the sitemap and canonical): a single segment that no
 * module route claims is treated as /pages/<slug>.
 */
export function canonicalSiteSegments(segments: string[]): string[] {
  if (segments.length === 1 && segments[0] && !matchesSiteRoute(segments) && !["admin", "dashboard", "login", "setup"].includes(segments[0])) {
    return ["pages", segments[0]]
  }
  return segments
}

function matchDynamic(pattern: string, actual: string): boolean {
  return matchDynamicParams(pattern, actual) !== null
}

function matchDynamicParams(pattern: string, actual: string): Record<string, string> | null {
  const patternParts = pattern.split("/")
  const actualParts = actual.split("/")
  if (patternParts.length !== actualParts.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i]
    const a = actualParts[i]
    if (p.startsWith(":")) {
      params[p.slice(1)] = a
      continue
    }
    if (p !== a) return null
  }
  return params
}

export type AdminNavItem = {
  titleKey: string
  url: string
  moduleSlug: string
  submodule: string
  order?: number
  capability?: string
  menuKey?: string
  /**
   * Blueprint-only: roles allowed to see this link, applied on top of `capability`.
   * Empty/undefined means "anyone who can see the group and holds the capability".
   */
  roles?: string[]
  /** Inverse of `roles` — hidden from these roles even when the group is visible. */
  hideFrom?: string[]
  items?: AdminNavItem[]
}

export type AdminNavSection = {
  section: string
  labelKey: string
  order: number
  items: AdminNavItem[]
  /** Blueprint group key. Absent on sections that fell through to legacy grouping. */
  groupKey?: string
  /** Key for `resolveNavGroupIcon`. */
  icon?: string
  collapsible?: boolean
  /** Audiences this group starts expanded for. */
  defaultOpenFor?: NavAudience[]
  /** Audiences allowed to see the group at all. */
  audiences?: NavAudience[]
  /** Lower sorts first in the mobile quick-access row. */
  mobilePriority?: number
}

/** One enabled, nav-visible route with the manifest metadata the layout needs. */
type NavLeaf = {
  /** Manifest route path; `""` is the dashboard root. */
  path: string
  titleKey: string
  url: string
  moduleSlug: string
  submodule: string
  order: number
  capability?: string
  menuKey?: string
  section: string
  navGroup?: string
  navOrder: number
}

/**
 * Every route that should be reachable from the sidebar for this tenant.
 *
 * Two modules can claim the same dashboard path (the full ledger and the commerce till
 * ledger both declare `accounting/*`). Manifest order decides the winner for routing, so
 * the nav must too — otherwise the sidebar shows the same link twice, pointing at two
 * different pages.
 */
function collectNavLeaves(activations: TenantActivation[]): NavLeaf[] {
  const leaves: NavLeaf[] = []
  const seenUrls = new Set<string>()

  for (const mod of MODULE_MANIFESTS) {
    for (const route of mod.adminRoutes) {
      if (route.path.includes(":")) continue
      if (route.path.endsWith("/new")) continue
      if (route.path === "catalog") continue
      if (route.navHidden) continue
      const url = route.path === "" ? DASHBOARD_BASE : dashboardPath(route.path)
      if (seenUrls.has(url)) continue
      if (!isSubmoduleEnabled(activations, mod.slug, route.submodule, { ignoreLicense: true })) continue
      seenUrls.add(url)
      leaves.push({
        path: route.path,
        titleKey: route.labelKey,
        url,
        moduleSlug: mod.slug,
        submodule: route.submodule,
        order: route.order ?? mod.adminNav?.order ?? 99,
        capability: route.capability,
        menuKey: route.menuKey ?? route.path.split("/")[0] ?? route.path,
        section: route.section,
        navGroup: route.navGroup,
        navOrder: route.navOrder ?? 99,
      })
    }
  }
  return leaves
}

function leafToItem(
  leaf: NavLeaf,
  roles?: string[],
  hideFrom?: string[],
): AdminNavItem {
  return {
    titleKey: leaf.titleKey,
    url: leaf.url,
    moduleSlug: leaf.moduleSlug,
    submodule: leaf.submodule,
    order: leaf.order,
    capability: leaf.capability,
    menuKey: leaf.menuKey,
    roles,
    hideFrom,
  }
}

function byManifestOrder(a: NavLeaf, b: NavLeaf): number {
  if (a.order !== b.order) return a.order - b.order
  return a.url.localeCompare(b.url)
}

function matchesPrefix(path: string, prefix: string): boolean {
  if (prefix.endsWith("/")) return path.startsWith(prefix)
  return path === prefix || path.startsWith(`${prefix}/`)
}

/**
 * Legacy manifest-derived grouping, kept for site types the blueprint does not describe
 * (resume, blog, poetry, courses) and for any newly added module that has not been
 * assigned a blueprint group yet. Nothing enabled ever disappears from the sidebar.
 */
function legacySections(leaves: NavLeaf[]): AdminNavSection[] {
  const sectionMap = new Map<string, AdminNavSection>()
  const buckets = new Map<string, { section: string; order: number; navGroup: string; children: NavLeaf[] }>()

  for (const leaf of leaves) {
    if (!sectionMap.has(leaf.section)) {
      sectionMap.set(leaf.section, {
        section: leaf.section,
        labelKey: `nav.section_${leaf.section}`,
        order: leaf.order,
        items: [],
      })
    } else {
      const sec = sectionMap.get(leaf.section)!
      sec.order = Math.min(sec.order, leaf.order)
    }
    if (leaf.navGroup) {
      const key = `${leaf.section}::${leaf.navGroup}`
      if (!buckets.has(key)) {
        buckets.set(key, { section: leaf.section, order: leaf.order, navGroup: leaf.navGroup, children: [] })
      }
      const bucket = buckets.get(key)!
      bucket.order = Math.min(bucket.order, leaf.order)
      bucket.children.push(leaf)
      continue
    }
    sectionMap.get(leaf.section)!.items.push(leafToItem(leaf))
  }

  for (const bucket of buckets.values()) {
    const sec = sectionMap.get(bucket.section)
    if (!sec) continue
    bucket.children.sort((a, b) => a.navOrder - b.navOrder)
    const head = bucket.children[0]
    sec.items.push({
      titleKey: `nav.group_${bucket.navGroup}`,
      url: head.url,
      moduleSlug: head.moduleSlug,
      submodule: head.submodule,
      order: bucket.order,
      capability: head.capability,
      menuKey: head.menuKey,
      items: bucket.children.map((leaf) => leafToItem(leaf)),
    })
  }

  for (const sec of sectionMap.values()) {
    sec.items.sort((a, b) => {
      const ao = a.order ?? 99
      const bo = b.order ?? 99
      if (ao !== bo) return ao - bo
      return a.url.localeCompare(b.url)
    })
  }
  return [...sectionMap.values()]
    .filter((sec) => sec.items.length > 0)
    // Legacy groups always trail the blueprint's, whatever `order` the manifests picked.
    .sort((a, b) => a.order - b.order)
    .map((sec) => ({ ...sec, order: sec.order + 1000 }))
}

/**
 * Build the dashboard sidebar for a tenant.
 *
 * Layout comes from {@link NAV_BLUEPRINT}: ordered, collapsible, role-scoped groups built
 * around how a café actually works. Routes the blueprint does not claim fall through to
 * {@link legacySections} so no enabled page is ever orphaned.
 *
 * Role filtering is deliberately *not* applied here — this function has no user. It stamps
 * each section with its `audiences` and each item with any `roles` restriction, and the
 * caller (`useDashboardNav`) drops what the signed-in user may not see. That keeps this
 * module free of auth state and unit-testable.
 */
export function buildAdminNav(activations: TenantActivation[]): AdminNavSection[] {
  const leaves = collectNavLeaves(activations)
  const byPath = new Map<string, NavLeaf>()
  for (const leaf of leaves) byPath.set(leaf.path, leaf)

  const claimed = new Set<NavLeaf>()
  const sections: AdminNavSection[] = []

  for (const group of orderedBlueprintGroups()) {
    const items: AdminNavItem[] = []

    const takeSubtree = (prefixes: string[]): NavLeaf[] => {
      const found = leaves
        .filter((l) => !claimed.has(l) && prefixes.some((p) => matchesPrefix(l.path, p)))
        .sort((a, b) => a.navOrder - b.navOrder || byManifestOrder(a, b))
      for (const l of found) claimed.add(l)
      return found
    }

    // 1. Explicitly listed links, in the blueprint's order.
    for (const entry of group.entries) {
      if ("subtree" in entry) {
        const children = takeSubtree(entry.prefixes)
        if (children.length === 0) continue
        const head = children[0]
        // A drawer holding one link is not a drawer. Render the link itself and save the
        // click, the chevron and the duplicated label.
        if (children.length === 1) {
          items.push(leafToItem(head, entry.roles, entry.hideFrom))
          continue
        }
        items.push({
          titleKey: entry.labelKey,
          url: head.url,
          moduleSlug: head.moduleSlug,
          submodule: head.submodule,
          order: head.order,
          capability: head.capability,
          menuKey: head.menuKey,
          roles: entry.roles,
          hideFrom: entry.hideFrom,
          items: children.map((leaf) => leafToItem(leaf)),
        })
        continue
      }
      const leaf = byPath.get(entry.path)
      if (!leaf || claimed.has(leaf)) continue
      claimed.add(leaf)
      items.push(leafToItem(leaf, entry.roles, entry.hideFrom))
    }

    // 2. Same-domain routes the blueprint does not list, so nothing is lost. Flat by
    //    default; folded into one labelled sub-menu when the group asks for it.
    if (group.absorb?.length) {
      const rest = takeSubtree(group.absorb)
      if (rest.length === 1) {
        items.push(leafToItem(rest[0]))
      } else if (rest.length > 0) {
        if (group.absorbAs) {
          const head = rest[0]
          items.push({
            titleKey: group.absorbAs,
            url: head.url,
            moduleSlug: head.moduleSlug,
            submodule: head.submodule,
            order: head.order,
            capability: head.capability,
            menuKey: head.menuKey,
            items: rest.map((leaf) => leafToItem(leaf)),
          })
        } else {
          for (const leaf of rest) items.push(leafToItem(leaf))
        }
      }
    }

    if (items.length === 0) continue
    sections.push({
      section: group.key,
      labelKey: group.labelKey,
      order: group.order,
      items,
      groupKey: group.key,
      icon: group.icon,
      collapsible: group.collapsible,
      defaultOpenFor: group.defaultOpenFor,
      audiences: group.audiences,
      mobilePriority: group.mobilePriority,
    })
  }

  return [...sections, ...legacySections(leaves.filter((l) => !claimed.has(l)))]
}
