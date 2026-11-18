import { headers } from "next/headers"
import { cache } from "react"

import { canonicalSiteSegments } from "@/kernel/route-resolver"
import { apiServer } from "@/lib/api-server"

import { dirForLang, pageSlugFromPath, previewTokenFromPath, uiLocaleForLang } from "./lang"

/**
 * Language of the builder page being rendered (from the middleware's x-webino-path), so the root <html> and the
 * storefront shell (header/footer/menus) follow an LTR page, not just its content. Null when not a page / no lang.
 */
function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

export type PageLang = { lang: string; dir: "rtl" | "ltr"; uiLocale: "fa" | "en" }

export const requestPageLang = cache(async (): Promise<PageLang | null> => {
  const path = (await headers()).get("x-webino-path")
  const segments = (path ?? "").split(/[?#]/)[0].split("/").filter(Boolean)
  const root = segments.length === 1 ? canonicalSiteSegments(segments) : null
  const slug = pageSlugFromPath(path) ?? (root && root[0] === "pages" ? safeDecode(root[1]) : null)
  const token = slug ? null : previewTokenFromPath(path)
  if (!slug && !token) return null
  const url = slug ? `/api/v1/public/pages/${encodeURIComponent(slug)}` : `/api/v1/public/builder/preview/${token}`
  const res = await apiServer<{ data?: { lang?: string | null } }>(url, { revalidate: slug ? 60 : 0 }).catch(() => null)
  const lang = res?.data?.lang
  return typeof lang === "string" && /^[a-z]{2}(-[A-Za-z]{2})?$/.test(lang) ? { lang, dir: dirForLang(lang), uiLocale: uiLocaleForLang(lang) } : null
})
