/** WooCommerce-style root permalink for a product category (parisma.ir: /{slug}/); resolved by the catch-all slug resolver. */
export const categoryHref = (slug: string) => `/${encodeURIComponent(slug)}`

/**
 * Product storefront path. `/product/{slug}` is always registered; root `/{slug}` is also valid when
 * SEO product_permalink_base is empty (migrated WP stores).
 */
export function productHref(slug: string, opts?: { root?: boolean }): string {
  const s = encodeURIComponent(slug)
  return opts?.root ? `/${s}` : `/product/${s}`
}
