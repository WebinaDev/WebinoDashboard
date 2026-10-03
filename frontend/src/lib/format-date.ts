import { emptyMark, formatDate, normalizeUiLocale } from "@/lib/locale"

type DateInput = string | number | Date | null | undefined

/** Date only. Jalali + Persian digits for `fa`, Gregorian for `en`. */
export function formatDisplayDate(value: DateInput, locale: string, empty?: string): string {
  if (value == null || value === "") return empty ?? emptyMark(locale)
  return formatDate(value, normalizeUiLocale(locale))
}

/** Date + time. Jalali + Persian digits for `fa`, Gregorian for `en`. */
export function formatDisplayDateTime(value: DateInput, locale: string, empty?: string): string {
  if (value == null || value === "") return empty ?? emptyMark(locale)
  return formatDate(value, normalizeUiLocale(locale), { includeTime: true })
}
