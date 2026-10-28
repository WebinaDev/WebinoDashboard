"use client"

import { useEffect, useState } from "react"
import {
  filterNavItems,
  navItemHref as baseNavItemHref,
  navItemsToLinks as baseNavItemsToLinks,
  navItemsToTree as baseNavItemsToTree,
  pickNavMenuItems,
  primeNavMenus,
  type NavHrefOptions,
  type NavMenuItem,
  type NavTreeNode,
  type PublicNavMenus,
} from "@webina/ui/nav-menus"
import { quietApi } from "@/builder/storefront/session"
import { categoryHref } from "@/kernel/store-slug-href"

/** «منوها» — shared core lives in @webina/ui/nav-menus; this file binds the store's permalinks and the public cache. */
export {
  NAV_LOCATIONS,
  NAV_TYPES,
  NAV_VISIBILITY,
  filterNavItems,
  navVisibilityClass,
  newNavItemId,
  type NavItemType,
  type NavMenu,
  type NavMenuItem,
  type NavTreeNode,
  type NavVisibility,
  type PublicNavMenus,
} from "@webina/ui/nav-menus"

export const NAV_HREF_OPTIONS: NavHrefOptions = { category: categoryHref }

/** Storefront URL for a menu item — root permalinks, never /pages/. */
export function navItemHref(it: Pick<NavMenuItem, "type" | "ref" | "url">): string {
  return baseNavItemHref(it, NAV_HREF_OPTIONS)
}

export function navItemsToLinks(items: NavMenuItem[]) {
  return baseNavItemsToLinks(items, NAV_HREF_OPTIONS)
}

export function navItemsToTree(items: NavMenuItem[]): NavTreeNode[] {
  return baseNavItemsToTree(items, NAV_HREF_OPTIONS)
}

let cache: PublicNavMenus | null = null
let inflight: Promise<PublicNavMenus> | null = null
const listeners = new Set<(m: PublicNavMenus) => void>()
const EMPTY: PublicNavMenus = { menus: {}, locations: {} }

export function loadPublicNavMenus(force = false): Promise<PublicNavMenus> {
  if (cache && !force) return Promise.resolve(cache)
  if (inflight && !force) return inflight
  inflight = quietApi<{ data?: PublicNavMenus }>("/api/v1/public/nav-menus").then((r) => {
    const raw = r.ok ? r.data.data : undefined
    cache = { menus: raw?.menus && !Array.isArray(raw.menus) ? raw.menus : {}, locations: raw?.locations && !Array.isArray(raw.locations) ? raw.locations : {} }
    inflight = null
    listeners.forEach((l) => l(cache!))
    return cache
  })
  return inflight
}

/** Admin edits (Menus page or builder inline editor) push here so previews update instantly. */
export function primeNavMenu(slug: string, menu: { id: number; name: string; items: NavMenuItem[] }, locations?: string[]) {
  cache = primeNavMenus(cache ?? EMPTY, slug, menu, locations)
  listeners.forEach((l) => l(cache!))
}

export function usePublicNavMenus(): PublicNavMenus | null {
  const [m, setM] = useState<PublicNavMenus | null>(cache)
  useEffect(() => {
    listeners.add(setM)
    void loadPublicNavMenus()
    return () => {
      listeners.delete(setM)
    }
  }, [])
  return m
}

/** Items for a location key (`header_main`, `footer_1`, …) or an explicit menu slug; `null` = nothing assigned → caller falls back. */
export function useNavMenuItems(opts: { location?: string; slug?: string }): NavMenuItem[] | null {
  return pickNavMenuItems(usePublicNavMenus(), opts)
}

/** Builder widgets: `{label, href, children}` tree for a menu slug, or null (→ widget's own links). */
export function useMenuTree(slug: string | undefined): NavTreeNode[] | null {
  const items = useNavMenuItems({ slug: slug || "__none__" })
  if (!slug || !items) return null
  return navItemsToTree(filterNavItems(items, null))
}

/** Footer columns from explicit menu slugs or the footer_1..4 locations; null = nothing assigned. */
export function useFooterMenuColumns(slugs?: string[]): { title: string; items: NavMenuItem[] }[] | null {
  const all = usePublicNavMenus()
  if (!all) return null
  const keys = slugs?.length ? slugs : ["footer_1", "footer_2", "footer_3", "footer_4"].map((l) => all.locations[l]).filter((x): x is string => !!x)
  const cols = keys.map((k) => all.menus[k]).filter(Boolean).map((m) => ({ title: m.name, items: filterNavItems(m.items ?? [], false).filter((i) => i.visibility !== "logged_in") }))
  return cols.length ? cols : null
}
