"use client"

import { useEffect, useState } from "react"
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

function apiSort(sort: string): string {
  if (sort === "price") return "price_asc"
  if (sort === "price_desc") return "price_desc"
  if (sort === "featured" || sort === "popular") return "popular"
  if (sort === "best" || sort === "best_selling" || sort === "sales") return "best_selling"
  return "newest"
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
        facets: json.data.facets ?? null,
      }
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
  const q = params.get("q") ?? ""
  const category = params.get("category") ?? ""
  const brand = params.get("brand") ?? ""
  const tag = params.get("tag") ?? ""
  const attr = params.get("attr") ?? ""
  const sort = params.get("sort") ?? ""
  const inStock = params.get("in_stock") === "1"
  const onSale = params.get("on_sale") === "1"
  const sameDay = params.get("same_day") === "1"
  const minPrice = params.get("min_price") ?? ""
  const maxPrice = params.get("max_price") ?? ""
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1)

  const [state, setState] = useState<CatalogState>(EMPTY_CATALOG)

  useEffect(() => {
    let cancel = false
    const query = new URLSearchParams({
      per_page: String(Math.max(limit, 12)),
      page: String(page),
      sort: apiSort(sort),
    })
    if (q) query.set("q", q)
    if (category) query.set("category", category)
    if (brand) query.set("brand", brand)
    if (tag) query.set("tag", tag)
    if (attr) query.set("attr", attr)
    if (sameDay) query.set("same_day", "1")
    query.set("facets", "1")
    if (inStock) query.set("in_stock", "1")
    if (onSale) query.set("on_sale", "1")
    if (/^\d+$/.test(minPrice)) query.set("min_price", minPrice)
    if (/^\d+$/.test(maxPrice)) query.set("max_price", maxPrice)

    void fetchCatalogPayload(query.toString()).then((payload) => {
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
  }, [attr, brand, category, inStock, tag, limit, maxPrice, minPrice, onSale, page, q, sameDay, sort])

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
