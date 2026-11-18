import { api } from "@/lib/api"
import { primeNavMenu, type NavMenu, type NavMenuItem } from "@/lib/nav-menus"

/** Admin API for «منوها» — used by the Menus page and the builder nav-widget inline editor (same data). */
export const NAV_MENUS_KEY = ["nav-menus"] as const

export async function fetchNavMenus(): Promise<NavMenu[]> {
  const r = await api<{ data: NavMenu[] }>("/api/v1/nav-menus")
  return r.data ?? []
}

export async function saveNavMenu(m: Partial<NavMenu> & { name: string }): Promise<NavMenu> {
  const body = { name: m.name, slug: m.slug || undefined, items: m.items ?? [], locations: m.locations ?? [] }
  const r = m.id
    ? await api<{ data: NavMenu }>(`/api/v1/nav-menus/${m.id}`, { method: "PUT", json: body })
    : await api<{ data: NavMenu }>("/api/v1/nav-menus", { method: "POST", json: body })
  const saved = r.data
  primeNavMenu(saved.slug, { id: saved.id, name: saved.name, items: saved.items ?? [] }, saved.locations ?? [])
  return saved
}

export async function deleteNavMenu(id: number): Promise<void> {
  await api(`/api/v1/nav-menus/${id}`, { method: "DELETE" })
}

export async function navItemsFromCategories(): Promise<NavMenuItem[]> {
  const r = await api<{ data: NavMenuItem[] }>("/api/v1/nav-menus/from-categories")
  return r.data ?? []
}
