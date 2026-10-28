/** WooCommerce-style root permalink for a product category (parisma.ir: /{slug}/); resolved by the catch-all slug resolver. */
export const categoryHref = (slug: string) => `/${encodeURIComponent(slug)}`
