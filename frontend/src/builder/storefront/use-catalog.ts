"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"

import {
  buildCategoryTree,
  mapApiBrand,
  mapApiCategory,
  mapApiProduct,
  type ShopBrand,
  type ShopCategory,
  type ShopProduct,
} from "../catalog"

export type CatalogState = {
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
  if (sort === "featured" || sort === "best") return "popular"
  return "newest"
}

type CatalogPayload = {
  items: ShopProduct[]
  categories: ShopCategory[]
  brands: ShopBrand[]
  total: number
}

/** Dedupe identical public catalog GETs across header/home/footer hooks. */
const catalogInflight = new Map<string, Promise<CatalogPayload | null>>()

function fetchCatalogPayload(query: string): Promise<CatalogPayload | null> {
  const existing = catalogInflight.get(query)
  if (existing) return existing
  const base = process.env.NEXT_PUBLIC_API_URL ?? ""
  const promise = fetch(`${base}/api/v1/public/catalog?${query}`, { credentials: "include" })
    .then((res) => (res.ok ? res.json() : null))
    .then((json: { data?: { items?: unknown[]; categories?: unknown[]; brands?: unknown[]; pagination?: { total?: number } } } | null) => {
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
      }
    })
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
  const params = useSearchParams()
  const q = params.get("q") ?? ""
  const category = params.get("category") ?? ""
  const brand = params.get("brand") ?? ""
  const sort = params.get("sort") ?? ""
  const inStock = params.get("in_stock") === "1"
  const onSale = params.get("on_sale") === "1"
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
    if (inStock) query.set("in_stock", "1")
    if (onSale) query.set("on_sale", "1")

    void fetchCatalogPayload(query.toString()).then((payload) => {
      if (cancel || !payload) return
      setState({
        products: payload.items,
        categories: payload.categories,
        brands: payload.brands,
        live: true,
        total: payload.total,
        page,
      })
    })
    return () => {
      cancel = true
    }
  }, [brand, category, inStock, limit, onSale, page, q, sort])

  return state
}
