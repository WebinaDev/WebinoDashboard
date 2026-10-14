/** Query Builder + Loop Filter helpers (pure; tested). */
import type { GlobalQuery } from "./globals"

export const LOOP_FILTER_EVENT = "wb-loop-filter"

/** Active filter state a Loop Filter widget publishes to the Loop Grids of its group. */
export type LoopFilterState = { category?: string; q?: string; filters: Record<string, string> }

export type LoopFilterDetail = { group: string; source: string; state: Partial<LoopFilterState> & { filters?: Record<string, string> } }

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
