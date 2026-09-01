import { apiServer } from "@/lib/api-server"

import type { CafeVenuePayload, CatalogPayload } from "@/themes/cafe-starter/types"

export async function fetchCatalogueData(query?: string): Promise<{
  catalog: CatalogPayload | null
  venue: CafeVenuePayload | null
}> {
  const q = query?.trim()
  const catalogPath = q ? `/api/v1/public/catalog?q=${encodeURIComponent(q)}` : "/api/v1/public/catalog"

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

export async function fetchAboutData(): Promise<CafeVenuePayload | null> {
  const venueRes = await apiServer<{ data: CafeVenuePayload }>("/api/v1/public/cafe/venue", {
    revalidate: 60,
    tags: ["cafe-venue"],
  })
  return venueRes?.data ?? null
}

export async function getSiteTypeSlug(): Promise<string | null> {
  const res = await apiServer<{ data: { site_type_slug?: string | null } }>("/api/v1/public/tenant", {
    revalidate: 60,
    tags: ["tenant"],
  })
  return res?.data?.site_type_slug ?? null
}
