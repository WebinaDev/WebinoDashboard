"use client"

import { createContext, useContext, type ReactNode } from "react"

import type { ShopProduct } from "../catalog"

export type ProductSeed = { slug: string; product: ShopProduct } | null

const ProductSeedContext = createContext<ProductSeed>(null)

export function ProductSeedProvider({ seed, children }: { seed: ProductSeed; children: ReactNode }) {
  return <ProductSeedContext.Provider value={seed}>{children}</ProductSeedContext.Provider>
}

export function useProductSeed(slug?: string): ShopProduct | null {
  const seed = useContext(ProductSeedContext)
  if (!seed || !slug || seed.slug !== slug) return null
  return seed.product
}
