import { apiServer } from "@/lib/api-server"
import { mediaPath, usesLiveMedia } from "./poetry-media"
import { parseRows, propBool, propNum, propStr } from "./props"
import type { BuilderDocument, SectionNode, WidgetNode } from "./types"

/**
 * SSR data for data-driven widgets. Keys match the client hooks exactly
 * (`/v1/public/poetry/<path>` for useJson/useLatestPoems, `catalog::<query>` for useCatalog),
 * so the first render is complete in the HTML and the browser only fetches on filter/pagination.
 */
export type PrefetchMap = Record<string, unknown>

function walk(sections: SectionNode[], out: WidgetNode[]) {
  for (const s of sections) for (const c of s.columns) for (const w of c.widgets) {
    out.push(w)
    if (w.children) walk(w.children, out)
  }
}

function planKeys(w: WidgetNode, keys: Set<string>) {
  const p = w.props ?? {}
  const poetry = (path: string) => keys.add(`/v1/public/poetry/${path}`)
  switch (w.type) {
    case "poem-list": {
      if (parseRows(p.items, ["title"]).some((r) => r.title)) return
      const count = Math.min(24, Math.max(1, propNum(p, "count", 6)))
      const qs = new URLSearchParams({ per_page: String(count), ...(propStr(p, "sort") === "popular" ? { sort: "popular" } : {}) })
      poetry(`poems?${qs}`)
      return
    }
    case "poem-archive": {
      const perPage = Math.min(48, propNum(p, "perPage", 12))
      if (propBool(p, "showSidebar", true)) poetry("terms")
      poetry(`poems?${new URLSearchParams({ per_page: String(perPage), page: "1" })}`)
      return
    }
    case "poem-search": {
      const n = typeof p.perPage === "number" && p.perPage > 0 ? Math.min(50, p.perPage) : 12
      if (typeof p.showFilters === "boolean" ? p.showFilters : true) poetry("terms")
      poetry(`poems?${new URLSearchParams({ page: "1", per_page: String(n) })}`)
      return
    }
    case "shop-showcase": {
      if (propStr(p, "source", "catalog") === "manual" || parseRows(p.items, ["title"]).some((r) => r.title)) return
      const count = Math.min(24, Math.max(1, propNum(p, "count", 6)))
      const category = propStr(p, "category").trim()
      keys.add(`catalog::per_page=${Math.max(count, 24)}&sort=newest${category ? `&category=${encodeURIComponent(category)}` : ""}`)
      return
    }
    case "media-archive":
      if (usesLiveMedia(p.source)) poetry(mediaPath(60))
      return
    case "media-cards":
      if (usesLiveMedia(p.source)) poetry(mediaPath(Math.min(24, Math.max(1, propNum(p, "count", 8)))))
      return
    case "poetry-shop":
      if (propStr(p, "source", "catalog") === "manual") return
      keys.add("catalog::per_page=60&sort=newest")
      return
    case "poetry-product":
      keys.add("catalog::per_page=60&sort=newest")
      return
  }
}

export async function prefetchForDocuments(docs: (BuilderDocument | null | undefined)[]): Promise<PrefetchMap | undefined> {
  const widgets: WidgetNode[] = []
  for (const d of docs) if (d) walk(d.sections ?? [], widgets)
  const keys = new Set<string>()
  for (const w of widgets) planKeys(w, keys)
  if (!keys.size) return undefined
  const out: PrefetchMap = {}
  await Promise.all([...keys].map(async (key) => {
    if (key.startsWith("catalog::")) {
      const res = await apiServer<unknown>(`/api/v1/public/catalog?${key.slice(9)}`, { revalidate: 60, tags: ["catalog"] })
      if (res) out[key] = res
      return
    }
    const res = await apiServer<{ data?: unknown; meta?: unknown }>(`/api${key}`, { revalidate: 60, tags: ["poetry"] })
    if (res && "data" in res) {
      out[key] = res.data ?? null
      if (res.meta) out[`${key}::meta`] = res.meta
    }
  }))
  return Object.keys(out).length ? out : undefined
}
