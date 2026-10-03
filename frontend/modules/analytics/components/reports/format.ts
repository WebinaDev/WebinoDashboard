"use client"

import { useCallback, useMemo } from "react"
import { useLocale, useTranslations } from "next-intl"
import DateObject from "react-date-object"
import gregorian from "react-date-object/calendars/gregorian"
import persian from "react-date-object/calendars/persian"
import gregorian_en from "react-date-object/locales/gregorian_en"
import persian_fa from "react-date-object/locales/persian_fa"

import { formatMoneyText } from "@/components/currency/MoneyDisplay"
import { useEnumLabel } from "@/lib/enum-labels"
import { formatNumber, normalizeUiLocale, toLocaleDigits } from "@/lib/locale"

/** Monday of ISO week `week` in `year`. */
function isoWeekStart(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4)
  const jan4Dow = (jan4.getDay() + 6) % 7
  const monday = new Date(year, 0, 4 - jan4Dow)
  monday.setDate(monday.getDate() + (week - 1) * 7)
  return monday
}

/**
 * Human label for a series bucket key: `Y-m-d` (day), `Y-Www` (week → start date),
 * `Y-m` (month). Jalali for `fa`. Falls back to `fallback` for unknown shapes.
 */
export function formatSeriesKey(key: string, locale: string, fallback?: string): string {
  const fa = locale === "fa"
  let date: Date | null = null
  let kind: "day" | "month" = "day"

  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  const week = /^(\d{4})-W(\d{1,2})$/.exec(key)
  const month = /^(\d{4})-(\d{2})$/.exec(key)

  if (day) {
    date = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]))
  } else if (week) {
    date = isoWeekStart(Number(week[1]), Number(week[2]))
  } else if (month) {
    const y = Number(month[1])
    const m = Number(month[2])
    kind = "month"
    if (y < 1700) {
      const j = new DateObject({ year: y, month: m, day: 1, calendar: persian, locale: fa ? persian_fa : gregorian_en })
      return fa
        ? toLocaleDigits(j.format("MMMM YYYY"), "fa")
        : j.convert(gregorian, gregorian_en).format("MMM YYYY")
    }
    // Mid-month so a Gregorian bucket maps to its dominant Jalali month.
    date = new Date(y, m - 1, fa ? 15 : 1)
  }

  if (!date || Number.isNaN(date.getTime())) {
    return toLocaleDigits(fallback ?? key, fa ? "fa" : "en")
  }

  if (fa) {
    const j = new DateObject({ date, calendar: persian, locale: persian_fa })
    const raw = kind === "month" ? j.format("MMMM YYYY") : j.format("D MMMM")
    return toLocaleDigits(raw, "fa")
  }
  const g = new DateObject({ date, calendar: gregorian, locale: gregorian_en })
  return kind === "month" ? g.format("MMM YYYY") : g.format("MMM D")
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
