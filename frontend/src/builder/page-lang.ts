import { headers } from "next/headers"
import { cache } from "react"

import { apiServer } from "@/lib/api-server"

import { dirForLang, pageSlugFromPath } from "./lang"

/**
 * Language of the builder page being rendered (from the middleware's x-webino-path), so the root <html> and the
 * storefront shell (header/footer/menus) follow an LTR page, not just its content. Null when not a page / no lang.
 */
export const requestPageLang = cache(async (): Promise<{ lang: string; dir: "rtl" | "ltr" } | null> => {
  const slug = pageSlugFromPath((await headers()).get("x-webino-path"))
  if (!slug) return null
  const res = await apiServer<{ data?: { lang?: string | null } }>(`/api/v1/public/pages/${encodeURIComponent(slug)}`, { revalidate: 60 }).catch(() => null)
  const lang = res?.data?.lang
  return typeof lang === "string" && /^[a-z]{2}(-[A-Za-z]{2})?$/.test(lang) ? { lang, dir: dirForLang(lang) } : null
})
