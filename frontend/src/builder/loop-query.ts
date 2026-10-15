/** Query Builder + Loop Filter helpers (pure; tested). */
import type { GlobalQuery } from "./globals"

export const LOOP_FILTER_EVENT = "wb-loop-filter"

/** Active filter state a Loop Filter widget publishes to the Loop Grids of its group. */
export type LoopFilterState = { category?: string; q?: string; filters: Record<string, string>; archive?: ArchiveFilters }

/** Advanced product archive filters published by the `archive-filters` widget (price in minor units). */
export type ArchiveFilters = { minPrice?: number; maxPrice?: number; inStock?: boolean; onSale?: boolean; sort?: string; tag?: string; attr?: string }

export const ARCHIVE_SORTS = ["newest", "price_asc", "price_desc", "popular", "best_selling"] as const

export type LoopFilterDetail = { group: string; source: string; state: Partial<LoopFilterState> & { filters?: Record<string, string> } }

const SLUG_LIST = /^[\p{L}\p{N}_\-:,]+$/u

/** Drop invalid / empty archive filter values (shared by URL parsing and event reduction). */
export function cleanArchiveFilters(raw: ArchiveFilters): ArchiveFilters {
  const out: ArchiveFilters = {}
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : undefined)
  const min = num(raw.minPrice)
  const max = num(raw.maxPrice)
  if (min !== undefined && min > 0) out.minPrice = min
  if (max !== undefined && max > 0) out.maxPrice = max
  if (out.minPrice !== undefined && out.maxPrice !== undefined && out.minPrice > out.maxPrice) [out.minPrice, out.maxPrice] = [out.maxPrice, out.minPrice]
  if (raw.inStock) out.inStock = true
  if (raw.onSale) out.onSale = true
  if (raw.sort && (ARCHIVE_SORTS as readonly string[]).includes(raw.sort)) out.sort = raw.sort
  if (raw.tag && SLUG_LIST.test(raw.tag)) out.tag = raw.tag.slice(0, 200)
  if (raw.attr && SLUG_LIST.test(raw.attr)) out.attr = raw.attr.slice(0, 200)
  return out
}

/** URL query keys used for archive filter sync (prefixed with the filter group when one is set). */
function key(group: string, name: string): string {
  return group ? `${group}_${name}` : name
}

/** Read archive filters + category + q from a URL query string. */
export function archiveFiltersFromSearch(search: string, group = ""): { category?: string; q?: string; archive: ArchiveFilters } {
  const params = new URLSearchParams(search)
  const get = (name: string) => params.get(key(group, name)) ?? ""
  const n = (name: string) => (get(name) ? Number(get(name)) : undefined)
  const out: { category?: string; q?: string; archive: ArchiveFilters } = {
    archive: cleanArchiveFilters({ minPrice: n("min_price"), maxPrice: n("max_price"), inStock: get("in_stock") === "1", onSale: get("on_sale") === "1", sort: get("sort") || undefined, tag: get("tag") || undefined, attr: get("attr") || undefined }),
  }
  if (get("category")) out.category = get("category").slice(0, 120)
  if (get("q")) out.q = get("q").slice(0, 80)
  return out
}

/** Write archive filters into a URL query string (other params are kept; empty values are removed). */
export function archiveFiltersToSearch(search: string, state: { category?: string; q?: string; archive: ArchiveFilters }, group = ""): string {
  const params = new URLSearchParams(search)
  const a = cleanArchiveFilters(state.archive)
  const set = (name: string, value: string | undefined) => (value ? params.set(key(group, name), value) : params.delete(key(group, name)))
  set("category", state.category)
  set("q", state.q?.trim())
  set("min_price", a.minPrice ? String(a.minPrice) : undefined)
  set("max_price", a.maxPrice ? String(a.maxPrice) : undefined)
  set("in_stock", a.inStock ? "1" : undefined)
  set("on_sale", a.onSale ? "1" : undefined)
  set("sort", a.sort)
  set("tag", a.tag)
  set("attr", a.attr)
  return params.toString()
}

/** Catalog API params for archive filters (`builder=1` lets the API honour price/on-sale filters). */
export function archiveFilterParams(params: URLSearchParams, archive: ArchiveFilters | undefined): URLSearchParams {
  if (!archive) return params
  const a = cleanArchiveFilters(archive)
  if (a.minPrice) params.set("min_price", String(a.minPrice))
  if (a.maxPrice) params.set("max_price", String(a.maxPrice))
  if (a.inStock) params.set("in_stock", "1")
  if (a.onSale) params.set("on_sale", "1")
  if (a.sort) params.set("sort", a.sort)
  if (a.tag) params.set("tag", a.tag)
  if (a.attr) params.set("attr", a.attr)
  if (Object.keys(a).length) params.set("builder", "1")
  return params
}

/** Loop Grid sort values → catalog API sort values ("price" historically meant cheapest first). */
export function catalogSort(sort: string): string {
  return sort === "price" ? "price_asc" : sort
}

/** Props of a Loop Grid with a saved global query applied (the query wins over the widget's own query fields). */
export function mergeQueryProps(props: Record<string, unknown>, queries: GlobalQuery[] | undefined): Record<string, unknown> {
  const id = typeof props.queryId === "string" ? props.queryId : ""
  const query = id ? queries?.find((q) => q.id === id) : undefined
  if (!query) return props
  return {
    ...props,
    source: query.source,
    collection: query.collection ?? "",
    category: query.category ?? "",
    brand: query.brand ?? "",
    collectionSearch: query.search ?? "",
    collectionFilter: (query.filters ?? []).map((f) => `${f.key}=${f.value}`).join(", "),
    sort: query.sort ?? "newest",
    perPage: query.limit ?? 8,
    offset: query.offset ?? 0,
    onSale: Boolean(query.onSale),
    inStock: Boolean(query.inStock),
    exclude: query.exclude ?? "",
  }
}

/** Merge one widget's change into the group's state; empty values clear the key. */
export function reduceFilterState(current: LoopFilterState, change: LoopFilterDetail["state"]): LoopFilterState {
  const next: LoopFilterState = { ...current, filters: { ...current.filters } }
  if ("category" in change) next.category = change.category || undefined
  if ("archive" in change) {
    const archive = cleanArchiveFilters(change.archive ?? {})
    if (Object.keys(archive).length) next.archive = archive
    else delete next.archive
  }
  if ("q" in change) next.q = change.q?.trim() ? change.q.trim().slice(0, 80) : undefined
  for (const [key, value] of Object.entries(change.filters ?? {})) {
    if (!/^[a-z][a-z0-9_]*$/.test(key)) continue
    if (value) next.filters[key] = value.slice(0, 400)
    else delete next.filters[key]
  }
  return next
}

/** Loop Grid props with the group's filter state applied (collections: filter[] + q; products/posts: category + q). */
export function applyFilterState(props: Record<string, unknown>, state: LoopFilterState | null): Record<string, unknown> {
  if (!state) return props
  const out: Record<string, unknown> = { ...props }
  if (state.archive) out.archive = state.archive
  if (state.category) out.category = state.category
  if (state.q) {
    out.collectionSearch = state.q
    out.search = state.q
  }
  const pairs = Object.entries(state.filters)
  if (pairs.length) {
    const own = typeof props.collectionFilter === "string" && props.collectionFilter.trim() ? [props.collectionFilter] : []
    out.collectionFilter = [...own, ...pairs.map(([k, v]) => `${k}=${v}`)].join(", ")
  }
  return out
}

/** "value|label" lines → options (label defaults to value). */
export function parseFilterOptions(raw: string): { value: string; label: string }[] {
  return raw
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 60)
    .map((line) => {
      const [value, ...label] = line.split("|")
      return { value: value.trim(), label: label.join("|").trim() || value.trim() }
    })
    .filter((o) => o.value)
}
