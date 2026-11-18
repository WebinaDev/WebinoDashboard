/** Single-poem link. detailHref may use {slug}/{id}; a bare path gets `?poem=<slug>`. Default: /poem?poem={slug}. */
export const DEFAULT_POEM_HREF = "/poem?poem={slug}"

export function poemHref(detailHref: string | null | undefined, poem: { slug?: string | null; id?: string | number | null }): string {
  const key = String(poem.slug || poem.id || "").trim()
  let tpl = (detailHref || "").trim()
  if (!/^\//.test(tpl)) tpl = DEFAULT_POEM_HREF
  if (!key) return tpl.split("?")[0] || "/poem"
  if (/\{(slug|id)\}/.test(tpl)) {
    return tpl.replace(/\{slug\}/g, encodeURIComponent(key)).replace(/\{id\}/g, encodeURIComponent(String(poem.id ?? key)))
  }
  const [path, query = ""] = tpl.split("?")
  const qs = new URLSearchParams(query)
  qs.set("poem", key)
  return `${path || "/poem"}?${qs}`
}
