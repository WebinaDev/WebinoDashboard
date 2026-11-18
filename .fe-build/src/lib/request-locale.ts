import { cookies } from "next/headers"

import { defaultLocale, isLocale, type Locale } from "../../i18n"

/**
 * Request locale from the NEXT_LOCALE / locale cookies.
 *
 * Do not call `getLocale()` from `next-intl/server`. That imports `next-intl/config`,
 * whose production build throws "Couldn't find next-intl config file" unless the
 * next-intl plugin and `i18n/request.ts` are wired. That plugin breaks the
 * standalone Docker image (see the root layout), and the throw surfaced as the
 * dashboard home error boundary inside PermissionGate.
 */
export async function readRequestLocale(): Promise<Locale> {
  const jar = await cookies()
  const value = jar.get("NEXT_LOCALE")?.value ?? jar.get("locale")?.value
  return value && isLocale(value) ? value : defaultLocale
}
