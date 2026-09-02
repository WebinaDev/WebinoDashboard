import { cookies } from "next/headers"
import { getRequestConfig } from "next-intl/server"

import { defaultLocale, isLocale } from "../i18n"
import enMessages from "../messages/en.json"
import faMessages from "../messages/fa.json"

const messages = {
  fa: faMessages,
  en: enMessages,
} as const

export default getRequestConfig(async () => {
  const jar = await cookies()
  const cookie = jar.get("NEXT_LOCALE")?.value ?? jar.get("locale")?.value
  const locale = cookie && isLocale(cookie) ? cookie : defaultLocale

  return {
    locale,
    messages: messages[locale],
  }
})
