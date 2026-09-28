"use client"

import type { ReactNode } from "react"
import { useLocale, useTranslations } from "next-intl"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatNumber, normalizeUiLocale, toLocaleDigits, type UiLocale } from "@/lib/locale"
import { formatDate } from "@/lib/locale/format-date"
import { cn } from "@/lib/utils"

import { AnalyticsPeriodFilter, type AnalyticsRange } from "./AnalyticsPeriodFilter"
import { AnalyticsSourceBadge } from "./AnalyticsSourceBadge"

export type AnalyticsLocale = "fa" | "en"

export function useAnalyticsLocale(): AnalyticsLocale {
  const l: UiLocale = normalizeUiLocale(useLocale())
  return l === "fa" ? "fa" : "en"
}

export function fmtInt(v: number | null | undefined, lng: AnalyticsLocale): string {
  return formatNumber(Math.round(Number(v ?? 0)), lng)
}

export function fmtDecimal(v: number | null | undefined, lng: AnalyticsLocale, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—"
  return formatNumber(Number(v), lng, { maximumFractionDigits: digits })
}

export function fmtPct(v: number | null | undefined, lng: AnalyticsLocale, signed = false): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—"
  const n = Number(v)
  const sign = signed && n > 0 ? "+" : ""
  return `${sign}${formatNumber(n, lng, { maximumFractionDigits: 1 })}%`
}

/** Milliseconds → `m:ss`. */
export function fmtDuration(ms: number | null | undefined, lng: AnalyticsLocale): string {
  if (ms === null || ms === undefined || Number.isNaN(Number(ms))) return "—"
  const sec = Math.max(0, Math.round(Number(ms) / 1000))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return toLocaleDigits(`${m}:${String(s).padStart(2, "0")}`, lng)
}

/** `Y-m-d` → Jalali (fa) / ISO (en). */
export function fmtDay(day: string | null | undefined, lng: AnalyticsLocale): string {
  if (!day) return "—"
  return formatDate(day, { locale: lng })
}

/** Unix seconds or ISO string → localized date-time. */
export function fmtDateTime(v: string | number | null | undefined, lng: AnalyticsLocale): string {
  if (v === null || v === undefined || v === "") return "—"
  const iso =
    typeof v === "number" || /^\d+$/.test(String(v))
      ? new Date(Number(v) * 1000).toISOString()
      : String(v)
  return formatDate(iso, { locale: lng, includeTime: true })
}

export function shortHash(hash: string | null | undefined): string {
  if (!hash) return "—"
  return hash.length > 12 ? `${hash.slice(0, 12)}…` : hash
}

export function AnalyticsPanelHeader({
  range,
  source,
  showPeriod = true,
  children,
}: {
  range: AnalyticsRange
  source?: string | null
  showPeriod?: boolean
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap items-end gap-3">
        {showPeriod ? <AnalyticsPeriodFilter range={range} /> : null}
        {children}
      </div>
      <AnalyticsSourceBadge source={source} />
    </div>
  )
}

export function KpiCard({
  label,
  value,
  extra,
  className,
}: {
  label: string
  value: ReactNode
  extra?: ReactNode
  className?: string
}) {
  return (
    <Card className={cn("shadow-sm", className)}>
      <CardContent className="space-y-1 pt-6">
        <p className="text-muted-foreground text-sm">{label}</p>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {extra ? <div>{extra}</div> : null}
      </CardContent>
    </Card>
  )
}

export function KpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>{children}</div>
}

type GateQuery = {
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => unknown
}

export function AnalyticsQueryGate({
  query,
  variant = "table",
  children,
}: {
  query: GateQuery
  variant?: "table" | "overview"
  children: ReactNode
}) {
  const t = useTranslations("analytics")
  if (query.isError) {
    return (
      <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-destructive text-sm">
          {query.error ? getApiErrorMessage(query.error) || t("error") : t("error")}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
          {t("retry")}
        </Button>
      </div>
    )
  }
  if (query.isLoading) {
    return variant === "overview" ? (
      <div className="space-y-4" aria-busy="true" aria-label={t("loading")}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    ) : (
      <div className="space-y-2 rounded-md border p-4" aria-busy="true" aria-label={t("loading")}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    )
  }
  return <>{children}</>
}

export type DataColumn<R> = {
  key: string
  label: string
  cell: (row: R) => ReactNode
  className?: string
}

export function DataTable<R>({
  title,
  columns,
  rows,
  rowKey,
  footer,
}: {
  title?: string
  columns: DataColumn<R>[]
  rows: R[]
  rowKey?: (row: R, i: number) => string | number
  footer?: ReactNode
}) {
  const t = useTranslations("analytics")
  const body = rows.length ? (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.key} className={c.className}>
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={rowKey ? rowKey(row, i) : i}>
              {columns.map((c) => (
                <TableCell key={c.key} className={c.className}>
                  {c.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ) : (
    <p className="text-muted-foreground p-4 text-sm">{t("empty")}</p>
  )

  return (
    <Card className="shadow-sm">
      {title ? (
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">{title}</CardTitle>
        </CardHeader>
      ) : null}
      <CardContent className={cn("p-0", title ? "pt-0" : "")}>
        {body}
        {footer ? <div className="pb-3">{footer}</div> : null}
      </CardContent>
    </Card>
  )
}

type DailyRow = { day: string; visitors?: number; views?: number }

export function DailyTrafficChart({
  title,
  data,
  keys,
}: {
  title: string
  data: DailyRow[]
  keys: Array<"views" | "visitors">
}) {
  const t = useTranslations("analytics")
  const lng = useAnalyticsLocale()
  const chartData = data.map((r) => ({ ...r, label: fmtDay(r.day, lng) }))
  const config = {
    views: { label: t("kpi.views"), color: "var(--color-chart-1)" },
    visitors: { label: t("kpi.visitors"), color: "var(--color-chart-2)" },
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-72 min-h-0 pt-0">
        {chartData.length === 0 ? (
          <p className="text-muted-foreground flex h-full items-center justify-center text-sm">
            {t("emptyChart")}
          </p>
        ) : (
          <ChartContainer config={config} className="h-full min-h-[12rem] w-full min-w-0">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
              <YAxis
                tick={{ fontSize: 11 }}
                width={48}
                allowDecimals={false}
                tickFormatter={(v: number) => formatNumber(v, lng)}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              {keys.map((k) => (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  name={config[k].label}
                  stroke={`var(--color-${k})`}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

export function DimToggle<D extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: D
  options: Array<{ value: D; label: string }>
  onChange: (v: D) => void
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Button
            key={o.value}
            type="button"
            size="sm"
            variant={value === o.value ? "default" : "outline"}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
