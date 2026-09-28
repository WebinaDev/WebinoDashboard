"use client"

import { useMemo, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { cn } from "@/lib/utils"

import { useReportFormat, type ReportFormat } from "./format"
import type { HourRow, PriceTierRow, ReportSeriesPoint, StatusRow } from "./types"

export const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
]

type TooltipPayloadItem = { dataKey?: string | number; name?: string; value?: number | string; color?: string; payload?: Record<string, unknown> }

/** Tooltip body with locale digits and money formatting. */
function ReportTooltipBody({
  active,
  payload,
  label,
  config,
  moneyKeys,
  fmt,
  currency,
  title,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: ReactNode
  config: ChartConfig
  moneyKeys: string[]
  fmt: ReportFormat
  currency?: string
  title?: (payload: Record<string, unknown> | undefined, label: ReactNode) => ReactNode
}) {
  if (!active || !payload?.length) return null
  const heading = title ? title(payload[0]?.payload, label) : label
  return (
    <div className="bg-background grid min-w-[9rem] gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-md">
      {heading ? <div className="font-medium">{heading}</div> : null}
      {payload.map((item) => {
        const key = String(item.dataKey ?? item.name ?? "value")
        const cfg = config[key]
        const v = Number(item.value ?? 0)
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-[2px]" style={{ background: item.color ?? cfg?.color }} />
            <span className="text-muted-foreground">{cfg?.label ?? item.name}</span>
            <span className="ms-auto font-medium tabular-nums" dir="ltr">
              {moneyKeys.includes(key) ? fmt.money(v, currency) : fmt.num(v)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function useTooltip(config: ChartConfig, moneyKeys: string[], currency?: string, title?: (p: Record<string, unknown> | undefined, label: ReactNode) => ReactNode) {
  const fmt = useReportFormat()
  return (props: { active?: boolean; payload?: unknown; label?: unknown }) => (
    <ReportTooltipBody
      active={props.active}
      payload={props.payload as TooltipPayloadItem[] | undefined}
      label={props.label as ReactNode}
      config={config}
      moneyKeys={moneyKeys}
      fmt={fmt}
      currency={currency}
      title={title}
    />
  )
}

export function ChartCard({
  title,
  action,
  children,
  className,
  contentClassName,
}: {
  title: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}) {
  return (
    <Card className={cn("min-w-0 overflow-hidden shadow-sm", className)}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-2">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className={cn("h-64 min-w-0 pt-0 sm:h-72", contentClassName)}>{children}</CardContent>
    </Card>
  )
}

export function ChartEmpty() {
  const t = useTranslations("reports")
  return <p className="text-muted-foreground flex h-full items-center justify-center text-sm">{t("emptyHint")}</p>
}

const chartBox = "aspect-auto h-full w-full min-w-0"

/** Maps series rows to `{ label, ...}` with Jalali/Gregorian x-axis labels. */
export function useSeriesRows<R>(
  series: ReportSeriesPoint[],
  compare: ReportSeriesPoint[] | undefined,
  pick: (row: ReportSeriesPoint, prev: ReportSeriesPoint | undefined) => R,
) {
  const fmt = useReportFormat()
  return series.map((row, i) => ({ label: fmt.seriesLabel(row.key, row.label), ...pick(row, compare?.[i]) }))
}

export function RevenueOrdersChart({
  series,
  compareSeries,
  currency,
}: {
  series: ReportSeriesPoint[]
  compareSeries?: ReportSeriesPoint[]
  currency?: string
}) {
  const t = useTranslations("reports")
  const fmt = useReportFormat()
  const hasCompare = Boolean(compareSeries?.length)
  const data = useSeriesRows(series, compareSeries, (r, p) => ({
    revenue: r.revenue,
    orders: r.orders,
    compareRevenue: p?.revenue ?? 0,
  }))
  const config: ChartConfig = {
    revenue: { label: t("revenue"), color: CHART_COLORS[0] },
    compareRevenue: { label: t("comparePeriod"), color: CHART_COLORS[1] },
    orders: { label: t("orders"), color: CHART_COLORS[2] },
  }
  const tooltip = useTooltip(config, ["revenue", "compareRevenue"], currency)

  return (
    <ChartCard title={t("chart.revenueOrders")} contentClassName="sm:h-80">
      {data.length === 0 ? (
        <ChartEmpty />
      ) : (
        <ChartContainer config={config} className={chartBox}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
            <YAxis yAxisId="left" tickFormatter={(v) => fmt.num(v)} tickLine={false} axisLine={false} width={72} />
            <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => fmt.num(v)} tickLine={false} axisLine={false} width={40} />
            <ChartTooltip content={tooltip} />
            <ChartLegend content={<ChartLegendContent />} />
            <Area yAxisId="left" type="monotone" dataKey="revenue" stroke="var(--color-revenue)" fill="var(--color-revenue)" fillOpacity={0.18} strokeWidth={2} />
            {hasCompare ? (
              <Line yAxisId="left" type="monotone" dataKey="compareRevenue" stroke="var(--color-compareRevenue)" strokeDasharray="4 4" dot={false} strokeWidth={1.5} />
            ) : null}
            <Line yAxisId="right" type="monotone" dataKey="orders" stroke="var(--color-orders)" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ChartContainer>
      )}
    </ChartCard>
  )
}

export function ProfitChart({
  series,
  compareSeries,
  currency,
}: {
  series: ReportSeriesPoint[]
  compareSeries?: ReportSeriesPoint[]
  currency?: string
}) {
  const t = useTranslations("reports")
  const fmt = useReportFormat()
  const hasCompare = Boolean(compareSeries?.length)
  const data = useSeriesRows(series, compareSeries, (r, p) => ({
    revenue: r.revenue,
    cogs: r.cogs ?? 0,
    profit: r.profit ?? 0,
    compareProfit: p?.profit ?? 0,
  }))
  const config: ChartConfig = {
    revenue: { label: t("revenue"), color: CHART_COLORS[0] },
    cogs: { label: t("table.cogs"), color: CHART_COLORS[1] },
    profit: { label: t("table.profit"), color: CHART_COLORS[2] },
    compareProfit: { label: t("chart.compareProfit"), color: CHART_COLORS[3] },
  }
  const tooltip = useTooltip(config, ["revenue", "cogs", "profit", "compareProfit"], currency)

  return (
    <ChartCard title={t("chart.profit")} contentClassName="sm:h-80">
      {data.length === 0 ? (
        <ChartEmpty />
      ) : (
        <ChartContainer config={config} className={chartBox}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
            <YAxis tickFormatter={(v) => fmt.num(v)} tickLine={false} axisLine={false} width={72} />
            <ChartTooltip content={tooltip} />
            <ChartLegend content={<ChartLegendContent />} />
            <Area type="monotone" dataKey="revenue" stroke="var(--color-revenue)" fill="var(--color-revenue)" fillOpacity={0.12} />
            <Area type="monotone" dataKey="cogs" stroke="var(--color-cogs)" fill="var(--color-cogs)" fillOpacity={0.12} />
            <Line type="monotone" dataKey="profit" stroke="var(--color-profit)" strokeWidth={2} dot={false} />
            {hasCompare ? (
              <Line type="monotone" dataKey="compareProfit" stroke="var(--color-compareProfit)" strokeWidth={2} strokeDasharray="4 4" dot={false} />
            ) : null}
          </ComposedChart>
        </ChartContainer>
      )}
    </ChartCard>
  )
}

export type HBarRow = { name: string; value: number; value2?: number }

/** Horizontal bar chart (payment methods, sources, UTM, price tiers). */
export function HBarChart({
  title,
  rows,
  valueLabel,
  value2Label,
  money,
  currency,
  className,
}: {
  title: ReactNode
  rows: HBarRow[]
  valueLabel: string
  value2Label?: string
  money?: boolean
  currency?: string
  className?: string
}) {
  const fmt = useReportFormat()
  const hasSecond = Boolean(value2Label) && rows.some((r) => r.value2 !== undefined)
  const config: ChartConfig = {
    value: { label: valueLabel, color: CHART_COLORS[0] },
    ...(hasSecond ? { value2: { label: value2Label, color: CHART_COLORS[2] } } : {}),
  }
  const tooltip = useTooltip(config, money ? ["value", "value2"] : [], currency)
  const height = Math.max(160, rows.length * (hasSecond ? 44 : 32) + 40)

  return (
    <ChartCard title={title} className={className} contentClassName="h-auto sm:h-auto">
      {rows.length === 0 ? (
        <div className="h-48">
          <ChartEmpty />
        </div>
      ) : (
        <ChartContainer config={config} className={chartBox} style={{ height }}>
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" tickFormatter={(v) => fmt.num(v)} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" width={112} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <ChartTooltip content={tooltip} cursor={{ fillOpacity: 0.3 }} />
            {hasSecond ? <ChartLegend content={<ChartLegendContent />} /> : null}
            <Bar dataKey="value" fill="var(--color-value)" radius={4} />
            {hasSecond ? <Bar dataKey="value2" fill="var(--color-value2)" radius={4} /> : null}
          </BarChart>
        </ChartContainer>
      )}
    </ChartCard>
  )
}

export function PriceTierChart({ rows, currency }: { rows: PriceTierRow[]; currency?: string }) {
  const t = useTranslations("reports")
  const fmt = useReportFormat()
  return (
    <HBarChart
      title={t("chart.byPriceTier")}
      rows={rows.map((r) => ({ name: fmt.tierLabel(r.tier), value: r.revenue, value2: r.profit }))}
      valueLabel={t("revenue")}
      value2Label={t("table.profit")}
      money
      currency={currency}
    />
  )
}

export function HourlyBar({ rows, currency }: { rows: HourRow[]; currency?: string }) {
  const t = useTranslations("reports")
  const fmt = useReportFormat()
  const data = useMemo(() => {
    const byHour = new Map(rows.map((r) => [r.hour, r]))
    return Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: fmt.digits(h),
      orders: byHour.get(h)?.orders ?? 0,
      revenue: byHour.get(h)?.revenue ?? 0,
    }))
  }, [rows, fmt])
  const config: ChartConfig = {
    orders: { label: t("orders"), color: CHART_COLORS[0] },
    revenue: { label: t("revenue"), color: CHART_COLORS[1] },
  }
  const tooltip = useTooltip(config, ["revenue"], currency, (p) =>
    t("heatmap.hour", { hour: fmt.digits(Number(p?.hour ?? 0)) }),
  )
  const empty = data.every((d) => d.orders === 0)

  return (
    <ChartCard title={t("chart.byHour")}>
      {empty ? (
        <ChartEmpty />
      ) : (
        <ChartContainer config={{ orders: config.orders }} className={chartBox}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} interval={1} tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v) => fmt.num(v)} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
            <ChartTooltip content={tooltip} cursor={{ fillOpacity: 0.3 }} />
            <Bar dataKey="orders" fill="var(--color-orders)" radius={3} />
          </BarChart>
        </ChartContainer>
      )}
    </ChartCard>
  )
}

export function StatusPie({ rows, currency }: { rows: StatusRow[]; currency?: string }) {
  const t = useTranslations("reports")
  const fmt = useReportFormat()
  const data = rows
    .filter((r) => r.count > 0)
    .map((r) => ({ ...r, label: fmt.enumLabel("order_status", r.status) }))
  const config: ChartConfig = { count: { label: t("orders") } }

  return (
    <ChartCard title={t("chart.byStatus")} contentClassName="h-auto sm:h-auto">
      {data.length === 0 ? (
        <div className="h-48">
          <ChartEmpty />
        </div>
      ) : (
        <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ChartContainer config={config} className="aspect-square h-56 w-full min-w-0">
            <PieChart>
              <ChartTooltip
                content={(p) => {
                  const item = (p.payload as TooltipPayloadItem[] | undefined)?.[0]
                  if (!p.active || !item) return null
                  const row = item.payload as { label: string; count: number; revenue: number }
                  return (
                    <div className="bg-background grid gap-1 rounded-lg border px-2.5 py-1.5 text-xs shadow-md">
                      <div className="font-medium">{row.label}</div>
                      <div>
                        {t("orders")}: {fmt.num(row.count)}
                      </div>
                      <div dir="ltr" className="text-end">
                        {fmt.money(row.revenue, currency)}
                      </div>
                    </div>
                  )
                }}
              />
              <Pie data={data} dataKey="count" nameKey="label" innerRadius="45%" outerRadius="80%" paddingAngle={2}>
                {data.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <ul className="space-y-1.5 text-sm">
            {data.map((r, i) => (
              <li key={r.status} className="flex items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="min-w-0 flex-1 truncate">{r.label}</span>
                <span className="text-muted-foreground tabular-nums">{fmt.num(r.count)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartCard>
  )
}
