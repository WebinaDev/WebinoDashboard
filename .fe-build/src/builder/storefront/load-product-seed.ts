import { mapApiProduct, type ShopProduct } from "../catalog"
import { apiServer } from "@/lib/api-server"

export type ProductSeed = { slug: string; product: ShopProduct } | null

/** SSR seed for PDP so product widgets ship the product in the initial HTML. */
export async function loadProductSeed(slug: string | undefined): Promise<ProductSeed> {
  const key = (slug ?? "").trim()
  if (!key) return null
  const json = await apiServer<{ data?: Record<string, unknown> }>(
    `/api/v1/public/catalog/items/${encodeURIComponent(key)}`,
    { revalidate: 60, tags: ["catalog", `product:${key}`] },
  ).catch(() => null)
  if (!json?.data || typeof json.data !== "object") return null
  return { slug: key, product: mapApiProduct(json.data, 0) }
}
