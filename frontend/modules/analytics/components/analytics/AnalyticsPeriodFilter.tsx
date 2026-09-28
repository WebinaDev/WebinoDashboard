"use client"

import { useCallback, useId, useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"

import { LocaleDatePicker } from "@/components/LocaleDatePicker"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { normalizeUiLocale } from "@/lib/locale"
import {
  endOfDay,
  fromYmd,
  presetToRange,
  startOfDay,
  toUnixSeconds,
  toYmd,
  type ReportRange,
} from "@/lib/report-range"

export const ANALYTICS_PRESETS = ["thisMonth", "lastMonth", "last7", "last30", "custom"] as const

export type AnalyticsPreset = (typeof ANALYTICS_PRESETS)[number]

type RangeState = ReportRange & { preset: AnalyticsPreset }

export type AnalyticsRange = {
  preset: AnalyticsPreset
  fromDate: Date
  toDate: Date
  /** Unix seconds (stable while the selection does not change). */
  from: number
  to: number
  setPreset: (preset: AnalyticsPreset) => void
  setFromYmd: (ymd: string | null) => void
  setToYmd: (ymd: string | null) => void
}

export function useAnalyticsRange(defaultPreset: AnalyticsPreset = "thisMonth"): AnalyticsRange {
  const locale = normalizeUiLocale(useLocale())
  const [state, setState] = useState<RangeState>(() => ({
    preset: defaultPreset,
    ...presetToRange(defaultPreset, locale),
  }))

  const setPreset = useCallback(
    (preset: AnalyticsPreset) => {
      setState((prev) =>
        preset === "custom" ? { ...prev, preset } : { preset, ...presetToRange(preset, locale) }
      )
    },
    [locale]
  )

  const setFromYmd = useCallback((ymd: string | null) => {
    const d = ymd ? fromYmd(ymd) : null
    if (!d) return
    setState((prev) => {
      const from = startOfDay(d)
      const to = from > prev.to ? endOfDay(d) : prev.to
      return { preset: "custom", from, to }
    })
  }, [])

  const setToYmd = useCallback((ymd: string | null) => {
    const d = ymd ? fromYmd(ymd) : null
    if (!d) return
    setState((prev) => {
      const to = endOfDay(d)
      const from = to < prev.from ? startOfDay(d) : prev.from
      return { preset: "custom", from, to }
    })
  }, [])

  return useMemo(
    () => ({
      preset: state.preset,
      fromDate: state.from,
      toDate: state.to,
      from: toUnixSeconds(state.from),
      to: toUnixSeconds(state.to),
      setPreset,
      setFromYmd,
      setToYmd,
    }),
    [state, setPreset, setFromYmd, setToYmd]
  )
}

export function analyticsRangeQuery(range: Pick<AnalyticsRange, "from" | "to">, extra?: Record<string, string | number | undefined>) {
  const p = new URLSearchParams()
  p.set("from", String(range.from))
  p.set("to", String(range.to))
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (v !== undefined && v !== "") p.set(k, String(v))
  }
  return p.toString()
}

export function AnalyticsPeriodFilter({ range }: { range: AnalyticsRange }) {
  const t = useTranslations("analytics")
  const locale = normalizeUiLocale(useLocale())
  const id = useId()

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-preset`}>{t("period")}</Label>
        <Select value={range.preset} onValueChange={(v) => range.setPreset(v as AnalyticsPreset)}>
          <SelectTrigger id={`${id}-preset`} className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ANALYTICS_PRESETS.map((p) => (
              <SelectItem key={p} value={p}>
                {t(`periodPreset.${p}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid w-40 gap-1.5">
        <Label>{t("dateFrom")}</Label>
        <LocaleDatePicker
          locale={locale}
          value={toYmd(range.fromDate)}
          onChange={range.setFromYmd}
          aria-label={t("dateFrom")}
        />
      </div>
      <div className="grid w-40 gap-1.5">
        <Label>{t("dateTo")}</Label>
        <LocaleDatePicker
          locale={locale}
          value={toYmd(range.toDate)}
          onChange={range.setToYmd}
          aria-label={t("dateTo")}
        />
      </div>
    </div>
  )
}
