"use client"

import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react"
import { buildCatalogQuery, catalogApiSort } from "./catalog-query"
import { useArchiveParams } from "./archive-scope"

import {
  buildCategoryTree,
  mapApiBrand,
  mapApiCategory,
  mapApiProduct,
  type ShopBrand,
  type ShopCategory,
  type ShopProduct,
} from "../catalog"

export type CatalogFacetTerm = { slug: string; name: string; color?: string | null; count: number }
export type CatalogFacets = {
  price: { min: number; max: number }
  same_day_count: number
  attributes: { slug: string; name: string; type?: string; terms: CatalogFacetTerm[] }[]
}

export type CatalogState = {
  facets?: CatalogFacets | null
  products: ShopProduct[]
  categories: ShopCategory[]
  brands: ShopBrand[]
  live: boolean
  total: number
  page: number
}

const EMPTY_CATALOG: CatalogState = {
  products: [],
  categories: [],
  brands: [],
  live: false,
  total: 0,
  page: 1,
}

const apiSort = catalogApiSort

/**
 * SSR seed: the server page fetches the archive catalog once (same query string useCatalog builds)
 * so /shop, /search and category/brand/tag pages ship product links + images in the HTML.
 */
type CatalogSeed = { query: string; json: unknown } | null
const CatalogSeedContext = createContext<CatalogSeed>(null)

export function CatalogSeedProvider({ seed, children }: { seed: CatalogSeed; children: ReactNode }) {
  return createElement(CatalogSeedContext.Provider, { value: seed }, children)
}

/** Compare catalog queries ignoring per_page so archive SSR seed (48) matches product-grid (12). */
function catalogQueryKey(query: string): string {
  const params = new URLSearchParams(query)
  params.delete("per_page")
  return params.toString()
}

function seededState(seed: CatalogSeed, query: string, page: number): CatalogState | null {
  if (!seed || catalogQueryKey(seed.query) !== catalogQueryKey(query)) return null
  const payload = mapCatalogJson(seed.json as Parameters<typeof mapCatalogJson>[0])
  if (!payload) return null
  return { products: payload.items, categories: payload.categories, brands: payload.brands, facets: payload.facets ?? null, live: true, total: payload.total, page }
}

type CatalogPayload = {
  items: ShopProduct[]
  categories: ShopCategory[]
  brands: ShopBrand[]
  total: number
  facets?: CatalogFacets | null
}

export function mapCatalogJson(json: { data?: { items?: unknown[]; categories?: unknown[]; brands?: unknown[]; facets?: CatalogFacets | null; pagination?: { total?: number } } } | null): CatalogPayload | null {
      if (!json?.data) return null
      const items = Array.isArray(json.data.items) ? json.data.items : []
      const categories = Array.isArray(json.data.categories) ? json.data.categories : []
      const brands = Array.isArray(json.data.brands) ? json.data.brands : []
      const products = items
        .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
        .map((item, index) => mapApiProduct(item, index))
      const mappedCategories = categories
        .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
        .map((item, index) => mapApiCategory(item, index))
        .filter((item): item is ShopCategory => item !== null)
      const mappedBrands = brands
        .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
        .map((item) => mapApiBrand(item))
        .filter((item): item is ShopBrand => item !== null)
      return {
        items: products,
        categories: buildCategoryTree(mappedCategories),
        brands: mappedBrands,
        total: Number(json.data.pagination?.total ?? products.length) || 0,
        facets: normalizeFacets(json.data.facets),
      }
    }

/** Coerce imported/cached facet payloads (objects, nulls, PHP-serialised junk) into safe arrays. */
function normalizeFacets(raw: unknown): CatalogFacets | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const price = (r.price && typeof r.price === "object" ? r.price : {}) as Record<string, unknown>
  const attrs = Array.isArray(r.attributes) ? r.attributes : []
  return {
    ...(r as object),
    price: { min: Number(price.min) || 0, max: Number(price.max) || 0 },
    same_day_count: Number(r.same_day_count) || 0,
    attributes: attrs
      .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
      .map((a) => ({
        ...a,
        slug: String(a.slug ?? ""),
        name: String(a.name ?? ""),
        terms: (Array.isArray(a.terms) ? a.terms : [])
          .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
          .map((t) => ({ ...t, slug: String(t.slug ?? ""), name: String(t.name ?? ""), count: Number(t.count) || 0 })),
      }))
      .filter((a) => a.slug && a.terms.length > 0),
  } as CatalogFacets
}

/** Dedupe identical public catalog GETs across header/home/footer hooks. */
const catalogInflight = new Map<string, Promise<CatalogPayload | null>>()

export function fetchCatalogPayload(query: string): Promise<CatalogPayload | null> {
  const existing = catalogInflight.get(query)
  if (existing) return existing
  const base = process.env.NEXT_PUBLIC_API_URL ?? ""
  const promise = fetch(`${base}/api/v1/public/catalog?${query}`, { credentials: "include" })
    .then((res) => (res.ok ? res.json() : null))
    .then((json) => mapCatalogJson(json))
    .catch(() => null)
    .finally(() => {
      // Keep briefly so Strict Mode remount can reuse; then allow refresh.
      const clear = () => catalogInflight.delete(query)
      if (typeof window !== "undefined") window.setTimeout(clear, 2500)
      else clear()
    })
  catalogInflight.set(query, promise)
  return promise
}

/** Featured / popular products for chrome (footer bestsellers), ignores page URL filters. */
export function useFeaturedProducts(limit: number): ShopProduct[] {
  const [products, setProducts] = useState<ShopProduct[]>([])

  useEffect(() => {
    let cancel = false
    const query = new URLSearchParams({
      per_page: String(Math.max(limit, 4)),
      page: "1",
      sort: "popular",
    }).toString()
    void fetchCatalogPayload(query).then((payload) => {
      if (cancel || !payload?.items.length) return
      setProducts(payload.items.slice(0, limit))
    })
    return () => {
      cancel = true
    }
  }, [limit])

  return products
}

export function useCatalog(limit: number): CatalogState {
  const params = useArchiveParams()
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1)

  const seed = useContext(CatalogSeedContext)
  const query = buildCatalogQuery(params, limit)
  const [state, setState] = useState<CatalogState>(() => seededState(seed, query, page) ?? EMPTY_CATALOG)

  useEffect(() => {
    let cancel = false

    void fetchCatalogPayload(query).then((payload) => {
      if (cancel || !payload) return
      setState({
        products: payload.items,
        categories: payload.categories,
        brands: payload.brands,
        facets: payload.facets ?? null,
        live: true,
        total: payload.total,
        page,
      })
    })
    return () => {
      cancel = true
    }
  }, [query, page])

  return state
}

export type ProductQuery = {
  /** newest | price | price_desc | popular | best_selling */
  sort?: string
  limit: number
  category?: string
  brand?: string
  onSale?: boolean
  inStock?: boolean
}

/** Explicit product query for builder widgets (ignores the page URL filters). */
export function useProductQuery(query: ProductQuery): { products: ShopProduct[]; loading: boolean } {
  const { sort = "newest", limit, category = "", brand = "", onSale = false, inStock = false } = query
  const [state, setState] = useState<{ products: ShopProduct[]; loading: boolean }>({ products: [], loading: true })

  useEffect(() => {
    let cancel = false
    const params = new URLSearchParams({
      per_page: String(Math.max(1, Math.min(48, limit))),
      page: "1",
      sort: apiSort(sort),
    })
    if (category) params.set("category", category)
    if (brand) params.set("brand", brand)
    if (onSale) params.set("on_sale", "1")
    if (inStock) params.set("in_stock", "1")
    void fetchCatalogPayload(params.toString()).then((payload) => {
      if (cancel) return
      setState({ products: payload ? payload.items.slice(0, limit) : [], loading: false })
    })
    return () => {
      cancel = true
    }
  }, [brand, category, inStock, limit, onSale, sort])

  return state
}
