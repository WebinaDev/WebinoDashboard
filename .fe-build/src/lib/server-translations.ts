import { createTranslator } from "use-intl/core"
import { cookies } from "next/headers"

import { requestPageLang } from "@/builder/page-lang"

import { defaultLocale, isLocale, type Locale } from "../../i18n"
import enMessages from "../../messages/en.json"
import faMessages from "../../messages/fa.json"

const catalogs = {
  fa: faMessages,
  en: enMessages,
} as const

export async function resolveServerLocale(): Promise<Locale> {
  // Builder pages with their own language switch server-rendered UI strings too (see requestPageLang).
  const pageLang = await requestPageLang()
  if (pageLang) return pageLang.uiLocale
  const jar = await cookies()
  const cookie = jar.get("NEXT_LOCALE")?.value ?? jar.get("locale")?.value
  return cookie && isLocale(cookie) ? cookie : defaultLocale
}

export async function getServerTranslations(namespace?: string) {
  const locale = await resolveServerLocale()
  return createTranslator({
    locale,
    messages: catalogs[locale],
    namespace,
  })
}
