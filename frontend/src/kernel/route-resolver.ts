import { MODULE_MANIFESTS } from "./registry"
import type { ResolvedAdminRoute, ResolvedSiteRoute, TenantActivation } from "./types"
import { DASHBOARD_BASE, dashboardPath } from "./paths"

function activationKey(module: string, sub: string) {
  return `${module}.${sub}`
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

  if (moduleSlug === "commerce" && submoduleSlug === "accounting") {
    return (
      enabled("commerce", "accounting") ||
      enabled("commerce", "catalog") ||
      enabled("commerce", "orders")
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

  return enabled(moduleSlug, submoduleSlug)
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
        if (!isSubmoduleEnabled(activations, mod.slug, route.submodule)) {
          return null
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

export function buildAdminNav(activations: TenantActivation[]) {
  type NavLeaf = {
    titleKey: string
    url: string
    moduleSlug: string
    submodule: string
    order?: number
    capability?: string
    menuKey?: string
    items?: {
      titleKey: string
      url: string
      moduleSlug: string
      submodule: string
      capability?: string
      menuKey?: string
    }[]
  }
  const items: {
    section: string
    labelKey: string
    order: number
    items: NavLeaf[]
  }[] = []

  const sectionMap = new Map<string, (typeof items)[0]>()
  const groupBuckets = new Map<
    string,
    {
      section: string
      order: number
      titleKey: string
      url: string
      moduleSlug: string
      submodule: string
      capability?: string
      menuKey?: string
      children: {
        titleKey: string
        url: string
        moduleSlug: string
        submodule: string
        navOrder: number
        capability?: string
        menuKey?: string
      }[]
    }
  >()

  for (const mod of MODULE_MANIFESTS) {
    for (const route of mod.adminRoutes) {
      if (route.path.includes(":")) continue
      if (route.path.endsWith("/new")) continue
      if (route.path === "catalog") continue
      if (route.navHidden) continue
      if (!isSubmoduleEnabled(activations, mod.slug, route.submodule, { ignoreLicense: true })) continue
      const section = route.section
      const sectionOrder = route.order ?? mod.adminNav?.order ?? 99
      const menuKey = route.menuKey ?? route.path.split("/")[0] ?? route.path
      if (!sectionMap.has(section)) {
        sectionMap.set(section, {
          section,
          labelKey: `nav.section_${section}`,
          order: sectionOrder,
          items: [],
        })
      } else {
        const sec = sectionMap.get(section)!
        sec.order = Math.min(sec.order, sectionOrder)
      }

      if (route.navGroup) {
        const gk = `${section}::${route.navGroup}`
        if (!groupBuckets.has(gk)) {
          groupBuckets.set(gk, {
            section,
            order: sectionOrder,
            titleKey: `nav.group_${route.navGroup}`,
            url: dashboardPath(route.path),
            moduleSlug: mod.slug,
            submodule: route.submodule,
            capability: route.capability,
            menuKey,
            children: [],
          })
        }
        const bucket = groupBuckets.get(gk)!
        bucket.order = Math.min(bucket.order, sectionOrder)
        if ((route.navOrder ?? 99) < (bucket.children[0]?.navOrder ?? 9999)) {
          bucket.url = dashboardPath(route.path)
          bucket.submodule = route.submodule
          bucket.capability = route.capability
          bucket.menuKey = menuKey
        }
        bucket.children.push({
          titleKey: route.labelKey,
          url: dashboardPath(route.path),
          moduleSlug: mod.slug,
          submodule: route.submodule,
          navOrder: route.navOrder ?? 99,
          capability: route.capability,
          menuKey,
        })
        continue
      }

      sectionMap.get(section)!.items.push({
        titleKey: route.labelKey,
        url: route.path === "" ? DASHBOARD_BASE : dashboardPath(route.path),
        moduleSlug: mod.slug,
        submodule: route.submodule,
        order: sectionOrder,
        capability: route.capability,
        menuKey,
      })
    }
  }

  for (const bucket of groupBuckets.values()) {
    const sec = sectionMap.get(bucket.section)
    if (!sec) continue
    bucket.children.sort((a, b) => a.navOrder - b.navOrder)
    sec.items.push({
      titleKey: bucket.titleKey,
      url: bucket.url,
      moduleSlug: bucket.moduleSlug,
      submodule: bucket.submodule,
      order: bucket.order,
      capability: bucket.capability,
      menuKey: bucket.menuKey,
      items: bucket.children.map(({ titleKey, url, moduleSlug, submodule, capability, menuKey }) => ({
        titleKey,
        url,
        moduleSlug,
        submodule,
        capability,
        menuKey,
      })),
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

  return [...sectionMap.values()].sort((a, b) => a.order - b.order)
}
