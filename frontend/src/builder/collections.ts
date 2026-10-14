/** CMS collection helpers shared by the Loop Grid widget and the item page (pure; tested). */
export type CollectionCard = { key: string; href: string; title: string; image?: string | null; excerpt?: string }

function safeHref(href: string): string {
  const v = href.trim()
  if (!v) return "#"
  if (v.startsWith("/") || v.startsWith("#") || /^https?:\/\//i.test(v) || /^(mailto|tel):/i.test(v)) return v
  return "#"
}

type CollectionPayload = {
  collection?: { fields?: { key: string; type: string }[] }
  items?: { slug: string; title: string; data?: Record<string, string> }[]
  total?: number
}

/** Query string for a collection listing: paging, sort, `?q=` search and `filter[key]=value` pairs ("key=value, key2=value"). */
export function collectionQuery(props: Record<string, unknown>, limit: number, page: number, sort: string): string {
  const params = new URLSearchParams({ limit: String(limit), page: String(page), sort })
  const q = typeof props.collectionSearch === "string" ? props.collectionSearch.trim() : ""
  if (q) params.set("q", q)
  const raw = typeof props.collectionFilter === "string" ? props.collectionFilter : ""
  for (const pair of raw.split(/[,،\n]/)) {
    const [key, ...rest] = pair.split("=")
    const k = key?.trim() ?? ""
    const v = rest.join("=").trim()
    if (/^[a-z][a-z0-9_]*$/.test(k) && v) params.set(`filter[${k}]`, v)
  }
  return params.toString()
}

/** Maps CMS collection items to loop cards: first image field, first text field, first URL field as link. */
export function collectionRows(payload: CollectionPayload | null | undefined, collectionSlug = ""): { rows: CollectionCard[]; total: number } {
  const fields = payload?.collection?.fields ?? []
  const imageKey = fields.find((f) => f.type === "image")?.key
  const textKey = fields.find((f) => f.type === "textarea" || f.type === "text")?.key
  const urlKey = fields.find((f) => f.type === "url")?.key
  const rows = (payload?.items ?? []).map((item) => {
    const data = item.data ?? {}
    const link = urlKey ? safeHref(data[urlKey] ?? "") : "#"
    // Without a URL field, cards open the item's own page (/c/<collection>/<item>).
    const href = link !== "#" ? link : collectionSlug ? `/c/${encodeURIComponent(collectionSlug)}/${encodeURIComponent(item.slug)}` : ""
    return { key: item.slug, href, title: item.title, image: imageKey ? data[imageKey] || null : null, excerpt: textKey ? data[textKey] : undefined }
  })
  return { rows, total: Number(payload?.total ?? rows.length) || 0 }
}

