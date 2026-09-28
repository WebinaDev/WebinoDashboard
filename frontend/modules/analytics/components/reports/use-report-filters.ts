"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { toast } from "sonner"

import { api, apiDownload } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import {
  endOfDay,
  fromYmd,
  presetToRange,
  startOfDay,
  toUnixSeconds,
  toYmd,
  type ReportRangePreset,
} from "@/lib/report-range"

import type { ReportInterval } from "./types"

export type ReportQueryExtra = Record<string, string | number | null | undefined>

export type ReportFilters = {
  preset: ReportRangePreset
  from: Date
  to: Date
  interval: ReportInterval
  compare: boolean
  statuses: string[]
}

export const DEFAULT_REPORT_PRESET: ReportRangePreset = "thisMonth"

/** Backend `Order::STATUSES` slugs that count as sales (status filter options). */
export const SALE_STATUS_OPTIONS = [
  "paid",
  "processing",
  "sent-to-warehouse",
  "webino-in-stock",
  "webino-packaged",
  "webino-courier",
  "webino-post",
  "webino-tipax",
  "webino-ready-to-ship",
  "webino-shipping",
  "shipped",
  "completed",
] as const

export function useReportFilters() {
  const locale = useLocale()
  const [preset, setPreset] = useState<ReportRangePreset>(DEFAULT_REPORT_PRESET)
  const [range, setRange] = useState(() => presetToRange(DEFAULT_REPORT_PRESET, locale))
  const [interval, setInterval] = useState<ReportInterval>("day")
  const [compare, setCompare] = useState(false)
  const [statuses, setStatuses] = useState<string[]>([])

  const applyPreset = useCallback(
    (next: ReportRangePreset) => {
      setPreset(next)
      if (next !== "custom") setRange(presetToRange(next, locale))
    },
    [locale],
  )

  const setFromYmd = useCallback((ymd: string | null) => {
    const d = ymd ? fromYmd(ymd) : null
    if (!d) return
    setPreset("custom")
    setRange((r) => ({ from: startOfDay(d), to: d > r.to ? endOfDay(d) : r.to }))
  }, [])

  const setToYmd = useCallback((ymd: string | null) => {
    const d = ymd ? fromYmd(ymd) : null
    if (!d) return
    setPreset("custom")
    setRange((r) => ({ from: d < r.from ? startOfDay(d) : r.from, to: endOfDay(d) }))
  }, [])

  const filters = useMemo<ReportFilters>(
    () => ({ preset, from: range.from, to: range.to, interval, compare, statuses }),
    [preset, range, interval, compare, statuses],
  )

  const activeCount =
    (preset !== DEFAULT_REPORT_PRESET ? 1 : 0) +
    (compare ? 1 : 0) +
    (interval !== "day" ? 1 : 0) +
    (statuses.length > 0 ? 1 : 0)

  const reset = useCallback(() => {
    setPreset(DEFAULT_REPORT_PRESET)
    setRange(presetToRange(DEFAULT_REPORT_PRESET, locale))
    setInterval("day")
    setCompare(false)
    setStatuses([])
  }, [locale])

  return {
    filters,
    preset,
    applyPreset,
    fromYmd: toYmd(range.from),
    toYmd: toYmd(range.to),
    setFromYmd,
    setToYmd,
    interval,
    setInterval,
    compare,
    setCompare,
    statuses,
    setStatuses,
    activeCount,
    reset,
  }
}

export type ReportFilterState = ReturnType<typeof useReportFilters>

/** Stable primitive key for react-query (Dates are compared by value). */
export function reportFiltersKey(f: ReportFilters): string {
  return [toUnixSeconds(f.from), toUnixSeconds(f.to), f.interval, f.compare ? 1 : 0, f.statuses.join(",")].join("|")
}

export function buildReportQuery(filters: ReportFilters | null, extra?: ReportQueryExtra): string {
  const p = new URLSearchParams()
  if (filters) {
    p.set("from", String(toUnixSeconds(filters.from)))
    p.set("to", String(toUnixSeconds(filters.to)))
    p.set("interval", filters.interval)
    p.set("compare", filters.compare ? "1" : "0")
    if (filters.statuses.length) p.set("status", filters.statuses.join(","))
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined && v !== null && v !== "") p.set(k, String(v))
    }
  }
  return p.toString()
}

export function reportPath(section: string, filters: ReportFilters | null, extra?: ReportQueryExtra): string {
  return `/api/v1/reports/${section}?${buildReportQuery(filters, extra)}`
}

export function useReportQuery<T>(section: string, filters: ReportFilters | null, extra?: ReportQueryExtra) {
  const qs = buildReportQuery(filters, extra)
  return useQuery({
    queryKey: ["shop-reports", section, qs],
    queryFn: () => api<T>(`/api/v1/reports/${section}?${qs}`),
    placeholderData: keepPreviousData,
    retry: false,
  })
}

/** Search / sort / pagination state for server-paginated report tables. */
export function useReportList(defaultOrderby: string, defaultOrder: "asc" | "desc" = "desc", defaultPerPage = 25) {
  const [search, setSearchRaw] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [page, setPage] = useState(1)
  const [perPage, setPerPageRaw] = useState(defaultPerPage)
  const [orderby, setOrderby] = useState(defaultOrderby)
  const [order, setOrder] = useState<"asc" | "desc">(defaultOrder)

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const setSearch = useCallback((v: string) => {
    setSearchRaw(v)
    setPage(1)
  }, [])

  const setPerPage = useCallback((n: number) => {
    setPerPageRaw(n)
    setPage(1)
  }, [])

  const onSortChange = useCallback(
    (key: string) => {
      if (key === orderby) setOrder((o) => (o === "asc" ? "desc" : "asc"))
      else {
        setOrderby(key)
        setOrder("desc")
      }
      setPage(1)
    },
    [orderby],
  )

  const params = useMemo<ReportQueryExtra>(
    () => ({ search: debouncedSearch, page, per_page: perPage, orderby, order }),
    [debouncedSearch, page, perPage, orderby, order],
  )

  return { search, setSearch, page, setPage, perPage, setPerPage, orderby, order, onSortChange, params }
}

export type ReportListState = ReturnType<typeof useReportList>

export function useReportExport() {
  const t = useTranslations("reports")
  const [busy, setBusy] = useState(false)
  const run = useCallback(
    async (section: string, filters: ReportFilters | null, extra?: ReportQueryExtra) => {
      setBusy(true)
      try {
        await apiDownload(
          `/api/v1/reports/${section}/export?${buildReportQuery(filters, extra)}`,
          `report-${section}-${toYmd(new Date())}.csv`,
        )
      } catch (e) {
        toast.error(t("exportFailed"), { description: getApiErrorMessage(e) })
      } finally {
        setBusy(false)
      }
    },
    [t],
  )
  return { run, busy }
}
