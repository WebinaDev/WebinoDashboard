import { apiServer } from "@/lib/api-server"

import type { CafeEvent, CafeVenuePayload, CatalogItem, CatalogPayload } from "@/themes/cafe-starter/types"

export async function fetchCatalogueData(query?: string, menu?: string, branch?: string): Promise<{
  catalog: CatalogPayload | null
  venue: CafeVenuePayload | null
}> {
  const params = new URLSearchParams()
  if (query?.trim()) params.set("q", query.trim())
  if (menu?.trim()) params.set("menu", menu.trim())
  if (branch?.trim()) params.set("branch", branch.trim())
  const qs = params.toString()
  const catalogPath = qs ? `/api/v1/public/catalog?${qs}` : "/api/v1/public/catalog"

  const [catalogRes, venueRes] = await Promise.all([
    apiServer<{ data: CatalogPayload }>(catalogPath, { revalidate: 60, tags: ["catalog"] }),
    apiServer<{ data: CafeVenuePayload }>("/api/v1/public/cafe/venue", {
      revalidate: 60,
      tags: ["cafe-venue"],
    }),
  ])

  return {
    catalog: catalogRes?.data ?? null,
    venue: venueRes?.data ?? null,
  }
}

export async function fetchCatalogItem(slug: string): Promise<CatalogItem | null> {
  const res = await apiServer<{ data: CatalogItem }>(`/api/v1/public/catalog/items/${encodeURIComponent(slug)}`, {
    revalidate: 60,
    tags: [`catalog-item-${slug}`],
  })
  return res?.data ?? null
}

export async function fetchAboutData(): Promise<CafeVenuePayload | null> {
  const venueRes = await apiServer<{ data: CafeVenuePayload }>("/api/v1/public/cafe/venue", {
    revalidate: 60,
    tags: ["cafe-venue"],
  })
  return venueRes?.data ?? null
}

export async function fetchCafeEvents(): Promise<CafeEvent[]> {
  const res = await apiServer<{ data: CafeEvent[] }>("/api/v1/public/cafe/events", {
    revalidate: 60,
    tags: ["cafe-events"],
  })
  return res?.data ?? []
}

export async function getSiteTypeSlug(): Promise<string | null> {
  const res = await apiServer<{ data: { site_type_slug?: string | null } }>("/api/v1/public/tenant", {
    revalidate: 60,
    tags: ["tenant"],
  })
  return res?.data?.site_type_slug ?? null
}
