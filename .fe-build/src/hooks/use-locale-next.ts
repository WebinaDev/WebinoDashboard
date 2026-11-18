"use client"

import { useLocale as useNextIntlLocale, useTranslations } from "next-intl"
import {
  formatCurrency,
  formatNumber,
  isRtlLocale,
  type AppLocale,
} from "@/lib/locale"
import {
  formatDate,
  formatDateTime,
  formatDisplayDate,
  getCalendarConfig,
} from "@/lib/locale/format-date"

export function useLocaleNext() {
  const t = useTranslations()
  const locale = useNextIntlLocale() as AppLocale
  const isRtl = isRtlLocale(locale)

  return {
    t,
    locale,
    lang: locale,
    isRtl,
    formatNumber: (n: number) => formatNumber(n, locale),
    formatCurrency: (n: number) => formatCurrency(n, locale),
    formatDate: (iso: string, opts?: { includeTime?: boolean }) =>
      formatDate(iso, { locale: locale as "fa" | "en", includeTime: opts?.includeTime }),
    formatDateTime: (iso: string) => formatDateTime(iso, locale as "fa" | "en"),
    formatDisplayDate: (iso?: string | null, jalali?: string | null) =>
      formatDisplayDate(iso, jalali, locale as "fa" | "en"),
    getCalendarConfig: () => getCalendarConfig(locale as "fa" | "en"),
  }
}
