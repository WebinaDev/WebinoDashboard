/** Page language → text direction (pure; shared by the canvas, site shell and <html>). */
export const RTL_LANGS = ["fa", "ar", "ku", "ur", "he"] as const

export function dirForLang(lang: string | null | undefined, fallback: "rtl" | "ltr" = "rtl"): "rtl" | "ltr" {
  if (!lang) return fallback
  return (RTL_LANGS as readonly string[]).includes(lang.toLowerCase().split("-")[0]) ? "rtl" : "ltr"
}

/** Builder page slug from a storefront path (`/pages/<slug>`), or null. */
export function pageSlugFromPath(path: string | null | undefined): string | null {
  const m = /^\/pages\/([^/?#]+)\/?(?:[?#].*)?$/.exec(path ?? "")
  if (!m) return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    return null
  }
}
