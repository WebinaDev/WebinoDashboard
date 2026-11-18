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

/** UI message catalogue for a page language: fa/en as-is; other RTL languages → fa, other LTR languages → en. */
export function uiLocaleForLang(lang: string): "fa" | "en" {
  const base = lang.toLowerCase().split("-")[0]
  if (base === "fa" || base === "en") return base
  return dirForLang(base) === "rtl" ? "fa" : "en"
}

/** Preview token from `/preview/<token>`, or null. */
export function previewTokenFromPath(path: string | null | undefined): string | null {
  const m = /^\/preview\/(\d+\.[a-f0-9]{48})\/?(?:[?#].*)?$/.exec(path ?? "")
  return m ? m[1] : null
}

