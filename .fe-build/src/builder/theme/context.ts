export type ThemeKind =
  | "header"
  | "footer"
  | "single_post"
  | "single_page"
  | "single_product"
  | "archive"
  | "search"
  | "product_archive"
  | "loop_item"
  | "not_found"
  | "popup"
  | "cart"
  | "checkout"
  | "account"
  | "collection_item"

export type ThemeQuery = {
  path: string
  singular?: "post" | "page" | "product" | "collection_item"
  archive?: "blog" | "category" | "tag" | "product" | "brand"
  search?: boolean
  notFound?: boolean
  /** Product/post slug on singular pages. */
  slug?: string
  /** Product category slug — or the collection slug when singular is collection_item.
   *  Product category slug (archive ?category= or the product's own category, resolved server-side). */
  category?: string
  /** Brand slug (brand archive; resolved server-side on product pages). */
  brand?: string
  /** Tag slug (tag archive). */
  tag?: string
}

function seg(path: string, prefix: string): string | undefined {
  const raw = path.slice(prefix.length).split("/")[0] || ""
  try {
    return decodeURIComponent(raw) || undefined
  } catch {
    return raw || undefined
  }
}

export function normalizeThemePath(path: string): string {
  const only = path.split("?")[0]?.trim() || "/"
  const withSlash = only.startsWith("/") ? only : `/${only}`
  if (withSlash !== "/" && withSlash.endsWith("/")) return withSlash.replace(/\/+$/, "") || "/"
  return withSlash || "/"
}

export function inferThemeQuery(pathname: string, search = ""): ThemeQuery {
  const path = normalizeThemePath(pathname)
  const params = new URLSearchParams(search)
  const isSearch = path === "/search" || params.has("s") || params.has("q")
  const category = params.get("category") || undefined
  if (path.startsWith("/product/")) return { path, singular: "product", search: isSearch, slug: decodeURIComponent(path.slice("/product/".length).split("/")[0] || "") || undefined }
  if (path.startsWith("/c/")) {
    const [collection, item] = path.slice(3).split("/")
    if (collection && item) return { path, singular: "collection_item", search: isSearch, category: decodeURIComponent(collection), slug: decodeURIComponent(item) }
  }
  if (path.startsWith("/pages/")) return { path, singular: "page", search: isSearch, slug: seg(path, "/pages/") }
  if (path.startsWith("/blog/") && path !== "/blog") return { path, singular: "post", search: isSearch, slug: decodeURIComponent(path.slice("/blog/".length).split("/")[0] || "") || undefined }
  if (path.startsWith("/tag/")) return { path, archive: "tag", search: isSearch, tag: seg(path, "/tag/") }
  if (path.startsWith("/brand/")) return { path, archive: "brand", search: isSearch, brand: seg(path, "/brand/") }
  if (path === "/blog") return { path, archive: "blog", search: isSearch }
  if (path.startsWith("/blog/category/") || path.startsWith("/category/")) return { path, archive: "category", search: isSearch, category: seg(path, path.startsWith("/blog/") ? "/blog/category/" : "/category/") }
  if (path === "/shop" || path.startsWith("/shop/") || path.startsWith("/product-category")) {
    return { path, archive: "product", search: isSearch, category: category ?? (path.startsWith("/product-category/") ? seg(path, "/product-category/") : undefined) }
  }
  return { path, search: isSearch }
}

export function themeQueryString(kind: string, query: ThemeQuery): string {
  const params = new URLSearchParams()
  params.set("kind", kind)
  params.set("path", query.path || "/")
  if (query.singular) params.set("singular", query.singular)
  if (query.archive) params.set("archive", query.archive)
  if (query.search) params.set("search", "1")
  if (query.notFound) params.set("not_found", "1")
  if (query.slug) params.set("slug", query.slug)
  if (query.category) params.set("category", query.category)
  if (query.brand) params.set("brand", query.brand)
  if (query.tag) params.set("tag", query.tag)
  return params.toString()
}
