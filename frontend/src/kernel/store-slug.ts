import { cache } from "react"

import { apiServer } from "@/lib/api-server"

export type StoreSlugHit = { type: "product" | "category" | "brand" | "tag"; slug: string; name: string }

const PREFIX_SCOPE: Record<string, "brand" | "tag" | "category"> = {
  "برند": "brand",
  brand: "brand",
  "برچسب": "tag",
  "product-tag": "tag",
  "دسته-بندی": "category",
  "product-category": "category",
}

const WC_NATIVE: Record<string, string> = {
  "my-account": "account",
  "حساب-کاربری": "account",
  "سبد-خرید": "cart",
  "تسویه-حساب": "checkout",
  "فروشگاه": "shop",
  "علاقه-مندی": "wishlist",
  "مقایسه": "compare",
}

const ROUTE_FOR: Record<StoreSlugHit["type"], string> = {
  product: "product",
  category: "product-category",
  brand: "brand",
  tag: "product-tag",
}

const safeDecode = (v: string) => {
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}

/** Ask the backend what a WooCommerce-style slug is (product → category → brand → tag). */
export const resolveStoreSlug = cache(async (slug: string, scope = "any"): Promise<StoreSlugHit | null> => {
  if (!slug || slug.length > 191) return null
  const res = await apiServer<{ data?: StoreSlugHit }>(
    `/api/v1/public/catalog/resolve-slug?slug=${encodeURIComponent(slug)}&scope=${scope}`,
    { revalidate: 60, tags: ["catalog"] },
  ).catch(() => null)
  return res?.data?.type ? res.data : null
})

/**
 * parisma.ir permalinks: /{product-or-category}/, /برند/{brand}/, /برچسب/{tag}/ → canonical
 * site segments (product/:slug, product-category/:slug, brand/:slug, product-tag/:slug).
 * `segments` is the output of canonicalSiteSegments (unknown single segments arrive as ["pages", x]).
 */
export async function resolveStoreSegments(raw: string[], segments: string[]): Promise<{ segments: string[]; hit: StoreSlugHit | null }> {
  const parts = raw.map(safeDecode).filter(Boolean)
  // Imported WooCommerce pages ([woocommerce_my_account] etc.) → native pages (mobile OTP account, cart…).
  const native = parts[0] ? WC_NATIVE[parts[0]] : undefined
  if (native && (parts.length === 1 || parts[0] === "my-account")) return { segments: [native], hit: null }
  if (parts.length === 2 && PREFIX_SCOPE[parts[0]]) {
    const scope = PREFIX_SCOPE[parts[0]]
    const hit = await resolveStoreSlug(parts[1], scope)
    return { segments: [ROUTE_FOR[scope], parts[1]], hit }
  }
  if (parts.length === 2 && ["product-category", "brand", "product-tag"].includes(parts[0])) {
    const scope = PREFIX_SCOPE[parts[0]] ?? "category"
    return { segments: [parts[0], parts[1]], hit: await resolveStoreSlug(parts[1], scope) }
  }
  if (parts.length === 1 && segments[0] === "pages") {
    const hit = await resolveStoreSlug(parts[0])
    if (hit) return { segments: [ROUTE_FOR[hit.type], hit.slug], hit }
  }
  return { segments, hit: null }
}
