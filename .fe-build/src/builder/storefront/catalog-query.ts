/** Pure (server + client) catalog query builder, shared by useCatalog and SSR seeding. */
export function catalogApiSort(sort: string): string {
  if (sort === "price") return "price_asc"
  if (sort === "price_desc") return "price_desc"
  if (sort === "updated") return "updated"
  if (sort === "featured" || sort === "popular") return "popular"
  if (sort === "best" || sort === "best_selling" || sort === "sales") return "best_selling"
  return "newest"
}

export function buildCatalogQuery(params: URLSearchParams, limit: number, apiSort: (s: string) => string = catalogApiSort): string {
  const get = (k: string) => params.get(k) ?? ""
  const q = get("q") || get("s")
  const page = Math.max(1, Number(get("page") || "1") || 1)
  const query = new URLSearchParams({ per_page: String(Math.max(limit, 12)), page: String(page), sort: apiSort(get("sort")) })
  if (q) query.set("q", q)
  for (const k of ["category", "brand", "tag", "attr"]) if (get(k)) query.set(k, get(k))
  if (get("same_day") === "1") query.set("same_day", "1")
  query.set("facets", "1")
  if (get("in_stock") === "1") query.set("in_stock", "1")
  if (get("on_sale") === "1") query.set("on_sale", "1")
  if (/^\d+$/.test(get("min_price"))) query.set("min_price", get("min_price"))
  if (/^\d+$/.test(get("max_price"))) query.set("max_price", get("max_price"))
  return query.toString()
}
