"use client"

import { useEffect, useState } from "react"
import { quietApi } from "@/builder/storefront/session"
import { categoryHref } from "@/kernel/store-slug-href"

/** «منوها» — shared types/helpers for the admin Menus section, the builder nav widget and the storefront. */
export type NavItemType = "custom" | "page" | "category" | "brand" | "product" | "post"
export type NavVisibility = "all" | "guest" | "logged_in" | "desktop" | "mobile" | "hidden"

export type NavMenuItem = {
  id: string
  label: string
  type: NavItemType
  ref?: string
  ref_id?: number
  url?: string
  icon?: string
  badge?: string
  badge_color?: string
  new_tab?: boolean
  mega?: boolean
  visibility?: NavVisibility
  children?: NavMenuItem[]
}

export type NavMenu = { id: number; name: string; slug: string; items: NavMenuItem[] | null; locations: string[] | null }

export const NAV_LOCATIONS: { key: string; label: string }[] = [
  { key: "header_main", label: "منوی اصلی هدر" },
  { key: "top_bar", label: "نوار بالایی" },
  { key: "mobile", label: "منوی موبایل" },
  { key: "mega_menu", label: "مگامنو (دسته‌بندی‌ها)" },
  { key: "footer_1", label: "ستون اول فوتر" },
  { key: "footer_2", label: "ستون دوم فوتر" },
  { key: "footer_3", label: "ستون سوم فوتر" },
  { key: "footer_4", label: "ستون چهارم فوتر" },
  { key: "footer_bottom", label: "پایین فوتر" },
]

export const NAV_TYPES: { key: NavItemType; label: string }[] = [
  { key: "custom", label: "لینک دلخواه" },
  { key: "page", label: "برگه" },
  { key: "category", label: "دسته‌بندی محصول" },
  { key: "brand", label: "برند" },
  { key: "product", label: "محصول" },
  { key: "post", label: "نوشته بلاگ" },
]

export const NAV_VISIBILITY: { key: NavVisibility; label: string }[] = [
  { key: "all", label: "همه" },
  { key: "guest", label: "فقط مهمان" },
  { key: "logged_in", label: "فقط کاربران واردشده" },
  { key: "desktop", label: "فقط دسکتاپ" },
  { key: "mobile", label: "فقط موبایل" },
  { key: "hidden", label: "مخفی" },
]

/** Storefront URL for a menu item — root permalinks, never /pages/. */
export function navItemHref(it: Pick<NavMenuItem, "type" | "ref" | "url">): string {
  const ref = (it.ref ?? "").trim()
  if (it.type !== "custom" && ref) {
    const e = encodeURIComponent(ref)
    switch (it.type) {
      case "category":
        return categoryHref(ref)
      case "brand":
        return `/brand/${e}`
      case "product":
        return `/product/${e}`
      case "post":
        return `/blog/${e}`
      case "page":
        return `/${e}`
    }
  }
  const url = (it.url ?? "").trim() || "#"
  return url.replace(/^\/pages\//, "/")
}

export function newNavItemId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** CSS classes for device-only visibility; guest/logged-in filtered by {@link filterNavItems}. */
export function navVisibilityClass(v?: NavVisibility): string {
  return v === "desktop" ? "max-md:hidden" : v === "mobile" ? "md:hidden" : ""
}

/** `loggedIn` null = auth unknown (builder widgets): only hidden items are dropped. */
export function filterNavItems(items: NavMenuItem[], loggedIn: boolean | null): NavMenuItem[] {
  return items
    .filter((i) => i.visibility !== "hidden" && !(loggedIn === true && i.visibility === "guest") && !(loggedIn === false && i.visibility === "logged_in"))
    .map((i) => ({ ...i, children: i.children?.length ? filterNavItems(i.children, loggedIn) : [] }))
}

/** Flatten a menu to simple `{label, href}` links for legacy consumers (header nav, footer columns). */
export function navItemsToLinks(items: NavMenuItem[]): { label: string; href: string; newTab?: boolean; icon?: string; badge?: string; badgeColor?: string; children?: { label: string; href: string; newTab?: boolean }[] }[] {
  return items.map((i) => ({
    label: i.label,
    href: navItemHref(i),
    newTab: i.new_tab,
    icon: i.icon,
    badge: i.badge,
    badgeColor: i.badge_color,
    children: (i.children ?? []).map((c) => ({ label: c.label, href: navItemHref(c), newTab: c.new_tab })),
  }))
}

export type PublicNavMenus = { menus: Record<string, { id: number; name: string; items: NavMenuItem[] }>; locations: Record<string, string> }

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
  const base = cache ?? EMPTY
  const locs = { ...base.locations }
  if (locations) {
    for (const [k, v] of Object.entries(locs)) if (v === slug && !locations.includes(k)) delete locs[k]
    for (const l of locations) locs[l] = slug
  }
  cache = { menus: { ...base.menus, [slug]: menu }, locations: locs }
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
  const all = usePublicNavMenus()
  if (!all) return null
  const slug = opts.slug || (opts.location ? all.locations[opts.location] : undefined)
  const items = slug ? all.menus[slug]?.items : undefined
  return items && items.length ? items : null
}

export type NavTreeNode = { label: string; href: string; newTab?: boolean; children: NavTreeNode[] }

export function navItemsToTree(items: NavMenuItem[]): NavTreeNode[] {
  return items.map((i) => ({ label: i.label, href: navItemHref(i), newTab: i.new_tab, children: navItemsToTree(i.children ?? []) }))
}

/** Builder widgets: `{label, href, children}` tree for a menu slug, or null (→ widget's own links). */
export function useMenuTree(slug: string | undefined): NavTreeNode[] | null {
  const items = useNavMenuItems({ slug: slug || "__none__" })
  if (!slug || !items) return null
  return navItemsToTree(filterNavItems(items, null))
}
