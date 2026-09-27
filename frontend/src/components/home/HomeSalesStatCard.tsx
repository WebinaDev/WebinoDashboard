"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer } from "@/components/ui/chart"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import type { DashboardOverviewSales } from "@/types/dashboardOverview"
import { MoneyDisplay } from "@/components/currency/MoneyDisplay"

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
  const chartData = useMemo(
    () =>
      sales.series.map((row, idx) => ({
        label: row.label,
        revenue: row.revenue,
        orders: row.orders,
        compareRevenue: sales.compare_series[idx]?.revenue ?? 0,
      })),
    [sales.series, sales.compare_series],
  )

  return (
    <Card>
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
        <p className="text-2xl font-semibold">
          <MoneyDisplay amount={sales.summary.revenue} currency={currency} />
        </p>
        <p className="text-xs text-muted-foreground">
          {formatNumber(sales.summary.order_count, lng)} {tReports("orders")}
        </p>
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
                  <linearGradient id="home-sales-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" hide />
                <YAxis hide />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-chart-1)"
                  fill="url(#home-sales-fill)"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="compareRevenue"
                  stroke="var(--color-chart-4)"
                  strokeDasharray="4 4"
                  dot={false}
                  strokeWidth={1.5}
                />
              </ComposedChart>
            </ChartContainer>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
