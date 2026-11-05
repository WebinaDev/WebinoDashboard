/* Shared SSR prefetch keys for cafe live widgets (server-prefetch.ts and cafe-widgets.tsx must agree). */

export const CAFE_VENUE_KEY = "/v1/public/cafe/venue"
export const CAFE_CATEGORIES_KEY = "catalog::per_page=1&facets=1"

export function cafeMenuCount(raw: number): number {
  return Math.max(4, Math.min(48, raw))
}

export function cafeMenuKey(count: number, category: string): string {
  const q = new URLSearchParams({ per_page: String(count), status: "publish" })
  if (category) q.set("category", category)
  return `catalog::${q}`
}
