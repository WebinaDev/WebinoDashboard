"use client"

import { MenuTreeEditor as BaseMenuTreeEditor, moveNavItem, type NavItemType, type NavMenuItem, type NavSourceRow } from "@webina/ui/nav-menus"

import { api } from "@/lib/api"
import { NAV_HREF_OPTIONS } from "@/lib/nav-menus"

export { moveNavItem }

/** Link picker search against this app's nav-menus API. */
export async function searchNavSources(type: NavItemType, q: string): Promise<NavSourceRow[]> {
  const r = await api<{ data: NavSourceRow[] }>(`/api/v1/nav-menus/sources?type=${type}&q=${encodeURIComponent(q)}`)
  return r.data ?? []
}

/** Shared editor from @webina/ui bound to this app's link search and permalinks. */
export function MenuTreeEditor(props: { items: NavMenuItem[]; onChange: (items: NavMenuItem[]) => void; compact?: boolean }) {
  return <BaseMenuTreeEditor {...props} searchSources={searchNavSources} hrefOptions={NAV_HREF_OPTIONS} />
}
