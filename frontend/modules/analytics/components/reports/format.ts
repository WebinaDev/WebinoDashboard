"use client"

import { useCallback, useMemo } from "react"
import { useLocale, useTranslations } from "next-intl"

import { formatMoneyText } from "@/components/currency/MoneyDisplay"
import { useEnumLabel } from "@/lib/enum-labels"
import { formatChartDateLabel, formatNumber, normalizeUiLocale, toLocaleDigits } from "@/lib/locale"

/**
 * Human label for a series bucket key: `Y-m-d` (day), `Y-Www` (week), `Y-m` (month).
 * Jalali + Persian digits for `fa`.
 */
export function formatSeriesKey(key: string, locale: string, fallback?: string): string {
  const known = /^(\d{4})-(\d{2})-(\d{2})$/.test(key) || /^(\d{4})-(\d{2})$/.test(key) || /^(\d{4})-W(\d{1,2})$/.test(key)
  if (!known) return fallback ?? formatChartDateLabel(key, locale)
  return formatChartDateLabel(key, locale)
}

export function useReportFormat() {
  const locale = useLocale()
  const lng = normalizeUiLocale(locale)
  const t = useTranslations("reports")
  const enumLabel = useEnumLabel()

  const num = useCallback((n: unknown) => formatNumber(Number(n ?? 0) || 0, lng), [lng])
  const dec = useCallback(
    (n: unknown, digits = 1) =>
      formatNumber(Number(n ?? 0) || 0, lng, { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    [lng],
  )
  const pct = useCallback((n: unknown) => `${dec(n, 1)}${lng === "fa" ? "٪" : "%"}`, [dec, lng])
  const money = useCallback((n: unknown, currency?: string | null) => formatMoneyText(Number(n ?? 0) || 0, lng, currency), [lng])
  const digits = useCallback((s: string | number) => toLocaleDigits(String(s), lng), [lng])
  const seriesLabel = useCallback((key: string, fallback?: string) => formatSeriesKey(key, lng, fallback), [lng])

  const utmLabel = useCallback(
    (value: string | null | undefined) => {
      const v = (value ?? "").trim()
      if (!v) return t("financial.directNone")
      const k = `utm.${v.toLowerCase()}`
      return t.has(k as never) ? t(k as never) : v
    },
    [t],
  )

  const sourceLabel = useCallback(
    (value: string | null | undefined) => {
      const v = (value ?? "").trim()
      if (!v) return t("financial.directNone")
      const label = enumLabel("sales_channel", v)
      if (label !== v) return label
      const k = `source.${v.toLowerCase()}`
      if (t.has(k as never)) return t(k as never)
      return utmLabel(v)
    },
    [enumLabel, t, utmLabel],
  )

  const tierLabel = useCallback(
    (tier: string) => {
      if (tier.startsWith("marketplace:")) {
        const platform = tier.slice("marketplace:".length)
        return t("tier.marketplace", { platform: utmLabel(platform) })
      }
      const k = `tier.${tier}`
      return t.has(k as never) ? t(k as never) : tier
    },
    [t, utmLabel],
  )

  return useMemo(
    () => ({ locale: lng, num, dec, pct, money, digits, seriesLabel, utmLabel, sourceLabel, tierLabel, enumLabel }),
    [lng, num, dec, pct, money, digits, seriesLabel, utmLabel, sourceLabel, tierLabel, enumLabel],
  )
}

export type ReportFormat = ReturnType<typeof useReportFormat>
