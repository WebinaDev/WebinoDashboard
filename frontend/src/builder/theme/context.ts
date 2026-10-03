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

export type ThemeQuery = {
  path: string
  singular?: "post" | "page" | "product"
  archive?: "blog" | "category" | "tag" | "product"
  search?: boolean
  notFound?: boolean
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
  if (path.startsWith("/product/")) return { path, singular: "product", search: isSearch }
  if (path.startsWith("/pages/")) return { path, singular: "page", search: isSearch }
  if (path.startsWith("/blog/") && path !== "/blog") return { path, singular: "post", search: isSearch }
  if (path.startsWith("/tag/")) return { path, archive: "tag", search: isSearch }
  if (path === "/blog") return { path, archive: "blog", search: isSearch }
  if (path.includes("/category/")) return { path, archive: "category", search: isSearch }
  if (path === "/shop" || path.startsWith("/shop/") || path.startsWith("/product-category")) {
    return { path, archive: "product", search: isSearch }
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
  return params.toString()
}
