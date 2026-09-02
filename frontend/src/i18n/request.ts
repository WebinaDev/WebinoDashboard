import { cookies } from "next/headers"
import { getRequestConfig } from "next-intl/server"

import { defaultLocale, isLocale } from "../../i18n"

export default getRequestConfig(async () => {
  const jar = await cookies()
  const cookie = jar.get("NEXT_LOCALE")?.value ?? jar.get("locale")?.value
  const locale = cookie && isLocale(cookie) ? cookie : defaultLocale

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
