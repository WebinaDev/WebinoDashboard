import { MODULE_MANIFESTS } from "./registry"
import type { ResolvedAdminRoute, ResolvedSiteRoute, TenantActivation } from "./types"

function activationKey(module: string, sub: string) {
  return `${module}.${sub}`
}

export function isSubmoduleEnabled(
  activations: TenantActivation[],
  moduleSlug: string,
  submoduleSlug: string,
): boolean {
  if (moduleSlug === "core") return true
  return activations.some(
    (a) =>
      a.module_slug === moduleSlug &&
      a.submodule_slug === submoduleSlug &&
      a.enabled &&
      a.licensed !== false,
  )
}

export function resolveAdminRoute(
  segments: string[],
  activations: TenantActivation[],
): ResolvedAdminRoute | null {
  if (segments.length === 0) {
    return {
      moduleSlug: "core",
      path: "",
      submodule: "dashboard",
      labelKey: "nav.dashboard",
      section: "overview",
      order: 0,
      fullPath: "/admin",
    }
  }

  const path = segments.join("/")

  for (const mod of MODULE_MANIFESTS) {
    for (const route of mod.adminRoutes) {
      if (route.path === path) {
        if (!isSubmoduleEnabled(activations, mod.slug, route.submodule)) {
          return null
        }
        return {
          ...route,
          moduleSlug: mod.slug,
          fullPath: `/admin/${route.path}`,
        }
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
      if (route.path === path || matchDynamic(route.path, path)) {
        if (!isSubmoduleEnabled(activations, mod.slug, route.submodule)) {
          return null
        }
        return {
          ...route,
          moduleSlug: mod.slug,
          fullPath: `/${path}`,
        }
      }
    }
  }

  return null
}

function matchDynamic(pattern: string, actual: string): boolean {
  const patternParts = pattern.split("/")
  const actualParts = actual.split("/")
  if (patternParts.length !== actualParts.length) return false
  return patternParts.every((p, i) => p.startsWith(":") || p === actualParts[i])
}

export function buildAdminNav(activations: TenantActivation[]) {
  const items: {
    section: string
    labelKey: string
    order: number
    items: { titleKey: string; url: string; moduleSlug: string; submodule: string }[]
  }[] = []

  const sectionMap = new Map<string, typeof items[0]>()

  for (const mod of MODULE_MANIFESTS) {
    for (const route of mod.adminRoutes) {
      if (!isSubmoduleEnabled(activations, mod.slug, route.submodule)) continue
      const section = route.section
      if (!sectionMap.has(section)) {
        sectionMap.set(section, {
          section,
          labelKey: `nav.section_${section}`,
          order: route.order ?? mod.adminNav?.order ?? 99,
          items: [],
        })
      }
      sectionMap.get(section)!.items.push({
        titleKey: route.labelKey,
        url: route.path === "" ? "/admin" : `/admin/${route.path}`,
        moduleSlug: mod.slug,
        submodule: route.submodule,
      })
    }
  }

  return [...sectionMap.values()].sort((a, b) => a.order - b.order)
}
