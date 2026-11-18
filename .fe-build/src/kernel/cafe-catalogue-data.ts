import { apiServer } from "@/lib/api-server"

// Menu, prices, hours, fees, VAT and venue settings must show the moment staff save them, so these reads skip the Next data cache.

import type { CafeEvent, CafeVenuePayload, CatalogItem, CatalogPayload } from "@/themes/cafe-starter/types"

export async function fetchCatalogueData(query?: string, menu?: string, branch?: string): Promise<{
  catalog: CatalogPayload | null
  venue: CafeVenuePayload | null
}> {
  const params = new URLSearchParams()
  params.set("per_page", "96")
  params.set("sort", "menu")
  params.set("show_unavailable", "1")
  if (query?.trim()) params.set("q", query.trim())
  if (menu?.trim()) params.set("menu", menu.trim())
  if (branch?.trim()) params.set("branch", branch.trim())
  const qs = params.toString()
  const catalogPath = `/api/v1/public/catalog?${qs}`

  const [catalogRes, venueRes] = await Promise.all([
    apiServer<{ data: CatalogPayload }>(catalogPath, { revalidate: false }),
    apiServer<{ data: CafeVenuePayload }>("/api/v1/public/cafe/venue", {
      revalidate: false,
    }),
  ])

  return {
    catalog: catalogRes?.data ?? null,
    venue: venueRes?.data ?? null,
  }
}

export async function fetchCatalogItem(slug: string): Promise<CatalogItem | null> {
  const res = await apiServer<{ data: CatalogItem }>(`/api/v1/public/catalog/items/${encodeURIComponent(slug)}`, {
    revalidate: false,
  })
  return res?.data ?? null
}

export async function fetchAboutData(): Promise<CafeVenuePayload | null> {
  const venueRes = await apiServer<{ data: CafeVenuePayload }>("/api/v1/public/cafe/venue", {
    revalidate: false,
  })
  return venueRes?.data ?? null
}

export async function fetchCafeEvents(): Promise<CafeEvent[]> {
  const res = await apiServer<{ data: CafeEvent[] }>("/api/v1/public/cafe/events", {
    revalidate: false,
  })
  return res?.data ?? []
}

export async function getSiteTypeSlug(): Promise<string | null> {
  const res = await apiServer<{ data: { site_type_slug?: string | null } }>("/api/v1/public/tenant", {
    revalidate: false,
  })
  return res?.data?.site_type_slug ?? null
}

export type ResolvedCafeTable = { id: number | null; code: string; label?: string | null; branch_slug?: string | null }

/** Checks a QR table (id or code) against the tables staff manage; unknown, inactive or deleted tables give null. */
export async function resolveCafeTable(table?: string | null, tableId?: string | null): Promise<ResolvedCafeTable | null> {
  const params = new URLSearchParams()
  if (table?.trim()) params.set("table", table.trim())
  if (tableId && /^\d+$/.test(tableId)) params.set("table_id", tableId)
  if (!params.toString()) return null
  const res = await apiServer<{ data: ResolvedCafeTable }>(`/api/v1/public/cafe/table?${params.toString()}`, { revalidate: false })
  return res?.data ?? null
}
