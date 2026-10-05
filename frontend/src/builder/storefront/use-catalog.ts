"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"

import {
  SAMPLE_BRANDS,
  SAMPLE_CATEGORIES,
  SAMPLE_PRODUCTS,
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

function apiSort(sort: string): string {
  if (sort === "price") return "price_asc"
  if (sort === "price_desc") return "price_desc"
  if (sort === "featured" || sort === "best") return "popular"
  return "newest"
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

  const [state, setState] = useState<CatalogState>({
    products: SAMPLE_PRODUCTS,
    categories: SAMPLE_CATEGORIES,
    brands: SAMPLE_BRANDS.map((name) => ({ name, slug: name })),
    live: false,
    total: SAMPLE_PRODUCTS.length,
    page: 1,
  })

  useEffect(() => {
    let cancel = false
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
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

    fetch(`${base}/api/v1/public/catalog?${query.toString()}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: { items?: unknown[]; categories?: unknown[]; brands?: unknown[]; pagination?: { total?: number } } } | null) => {
        if (cancel || !json?.data) return
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
        setState({
          products,
          categories: mappedCategories.length ? mappedCategories : SAMPLE_CATEGORIES,
          brands: mappedBrands.length ? mappedBrands : SAMPLE_BRANDS.map((name) => ({ name, slug: name })),
          live: true,
          total: Number(json.data.pagination?.total ?? products.length) || 0,
          page,
        })
      })
      .catch(() => undefined)
    return () => {
      cancel = true
    }
  }, [brand, category, inStock, limit, onSale, page, q, sort])

  return state
}
