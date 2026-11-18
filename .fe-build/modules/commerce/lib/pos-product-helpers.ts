import { ApiError, api } from "@/lib/api"

export type ProductVariantHit = {
  id: number
  name?: string | null
  sku?: string | null
  price_minor?: number
}

export type ProductHit = {
  id: number
  name: string
  sku?: string | null
  price_minor?: number
  variants?: ProductVariantHit[]
}

export type PosCartLine = {
  key: string
  product_id: number
  product_variant_id?: number | null
  name: string
  qty: number
  unit_price_minor: number
  purchase_type?: string
}

export const POS_PURCHASE_TYPES = ["cash", "credit", "installment", "wholesale"] as const

export function cartLineKey(productId: number, variantId?: number | null): string {
  return `${productId}:${variantId ?? 0}`
}

export function normalizePurchaseType(value: string | null | undefined): string {
  if (!value || value === "retail") return "cash"
  return value
}

export function variantLabel(v: ProductVariantHit): string {
  return v.name?.trim() || v.sku?.trim() || `#${v.id}`
}

export function lineDisplayName(product: ProductHit, variant?: ProductVariantHit | null): string {
  if (!variant) return product.name
  return `${product.name} — ${variantLabel(variant)}`
}

export async function searchPosProducts(q: string): Promise<ProductHit[]> {
  try {
    return await api<ProductHit[]>(`/api/v1/products/pos-search?q=${encodeURIComponent(q)}`)
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) {
      return api<ProductHit[]>(`/api/v1/products?search=${encodeURIComponent(q)}&per_page=20`)
    }
    throw e
  }
}

export function pickProductFromBarcodeScan(hits: ProductHit[], query: string): ProductHit | null {
  const q = query.trim()
  if (!q) return null
  const bySku = hits.filter((p) => p.sku && p.sku === q)
  if (bySku.length === 1) return bySku[0]
  const byVariantSku = hits.filter((p) => p.variants?.some((v) => v.sku === q))
  if (byVariantSku.length === 1) return byVariantSku[0]
  if (hits.length === 1) return hits[0]
  return null
}

export function productHasVariants(p: ProductHit): boolean {
  return (p.variants?.length ?? 0) > 0
}
