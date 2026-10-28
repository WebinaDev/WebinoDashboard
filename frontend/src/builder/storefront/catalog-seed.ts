import type { ArchiveScope } from "./archive-scope"
import { buildCatalogQuery } from "./catalog-query"
import { apiServer } from "@/lib/api-server"

/** Main archive grid size (ClassicArchive → useCatalog(48)); the seed only applies when the query matches. */
const ARCHIVE_GRID_LIMIT = 48

export async function loadCatalogSeed(searchParams: Record<string, string | undefined> | undefined, scope: ArchiveScope) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams ?? {})) if (typeof v === "string" && v !== "") params.set(k, v)
  for (const key of ["category", "brand", "tag"] as const) {
    const v = scope[key]
    if (v && !params.get(key)) params.set(key, v)
  }
  const query = buildCatalogQuery(params, ARCHIVE_GRID_LIMIT)
  const json = await apiServer<unknown>(`/api/v1/public/catalog?${query}`, { revalidate: 60, tags: ["catalog"] }).catch(() => null)
  return json ? { query, json } : null
}
