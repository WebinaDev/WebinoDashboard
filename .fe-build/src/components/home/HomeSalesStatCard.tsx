"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"

import { ChangePctBadge } from "@/components/home/ChangePctBadge"
import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { pctDelta } from "@/lib/pctDelta"
import { formatSeriesKey } from "../../../modules/analytics/components/reports/format"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import type { DashboardOverviewSales } from "@/types/dashboardOverview"

type HomeSalesStatCardProps = {
  sales: DashboardOverviewSales
  currency?: string
  locale: string
}

export function HomeSalesStatCard({
  sales,
  currency,
  locale,
}: HomeSalesStatCardProps) {
  const t = useTranslations("home")
  const tReports = useTranslations("reports")
  const lng = normalizeUiLocale(locale)
  const series = sales?.series ?? []
  const compareSeries = sales?.compare_series ?? []
  const summary = sales?.summary
  const chartData = useMemo(
    () =>
      series.map((row, idx) => ({
        label: row.label,
        revenue: row.revenue,
        orders: row.orders,
        compareRevenue: compareSeries[idx]?.revenue ?? 0,
      })),
    [series, compareSeries],
  )
  const revenueDelta = pctDelta(
    summary?.revenue ?? 0,
    sales?.compare_summary?.revenue,
  )
  const gradId = "home-sales-revenue-fill"

  if (!summary) {
    return null
  }

  const axisFmt = (v: number | string) =>
    formatNumber(typeof v === "number" ? v : Number(v) || 0, lng)

  return (
    <Card variant="stat">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {sales.range === "last30" ? t("sales.last30") : t("sales.this_month")}
        </CardTitle>
        <Button asChild variant="outline" size="sm" className="h-7 text-xs">
          <Link href="/dashboard/reports/overview">{t("sales.view_details")}</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{sales.month_label}</p>
        <MoneyDisplay
          amount={summary.revenue ?? 0}
          currency={currency}
          className="text-2xl font-semibold"
        />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span>
            {formatNumber(summary.order_count ?? 0, lng)} {tReports("orders")}
          </span>
          <ChangePctBadge value={revenueDelta} />
        </div>
        <div className="h-28 min-h-0 min-w-0 sm:h-36">
          {chartData.length === 0 ? (
            <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
              {tReports("emptyHint")}
            </p>
          ) : (
            <ChartContainer
              config={{
                revenue: { label: tReports("revenue"), color: "var(--color-chart-1)" },
                orders: { label: tReports("orders"), color: "var(--color-chart-3)" },
                compareRevenue: {
                  label: tReports("comparePeriod"),
                  color: "var(--color-chart-4)",
                },
              }}
              className="h-full min-h-[7rem] w-full sm:min-h-[9rem]"
            >
              <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9 }}
                  interval="preserveStartEnd"
                  tickFormatter={(v) => formatSeriesKey(String(v), lng, String(v))}
                />
                <YAxis tickFormatter={axisFmt} tick={{ fontSize: 9 }} width={40} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  fill={`url(#${gradId})`}
                  stroke="var(--color-chart-1)"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="compareRevenue"
                  stroke="var(--color-chart-4)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  opacity={0.65}
                />
                <Line
                  type="monotone"
                  dataKey="orders"
                  stroke="var(--color-chart-3)"
                  strokeWidth={1.5}
                  dot={false}
                />
              </ComposedChart>
            </ChartContainer>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
