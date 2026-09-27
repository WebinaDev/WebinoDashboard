import { formatDate, normalizeUiLocale } from "@/lib/locale"

type DateInput = string | number | Date | null | undefined

/** Date only — Jalali calendar + Persian digits for `fa`, Gregorian for `en`. */
export function formatDisplayDate(value: DateInput, locale: string, empty = "—"): string {
  if (value == null || value === "") return empty
  return formatDate(value, normalizeUiLocale(locale))
}

/** Date + time — Jalali calendar + Persian digits for `fa`, Gregorian for `en`. */
export function formatDisplayDateTime(value: DateInput, locale: string, empty = "—"): string {
  if (value == null || value === "") return empty
  return formatDate(value, normalizeUiLocale(locale), { includeTime: true })
}
