"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { formatChartDateLabel, formatNumber, normalizeUiLocale } from "@/lib/locale"
import type { OrderReportSeriesPoint } from "@/types/dashboardOverview"

type ProfitChartProps = {
  series: OrderReportSeriesPoint[]
  compareSeries?: OrderReportSeriesPoint[]
  locale: string
}

export function HomeProfitChart({
  series = [],
  compareSeries = [],
  locale,
}: ProfitChartProps) {
  const t = useTranslations("reports")
  const lng = normalizeUiLocale(locale)
  const axisFmt = (v: number | string) =>
    formatNumber(typeof v === "number" ? v : Number(v) || 0, lng)

  const chartData = useMemo(
    () =>
      series.map((row, idx) => ({
        label: formatChartDateLabel(row.key || row.label, lng),
        revenue: row.revenue,
        cogs: row.cogs ?? 0,
        profit: row.profit ?? 0,
        compareProfit: compareSeries[idx]?.profit ?? 0,
      })),
    [series, compareSeries, lng],
  )

  const empty = chartData.length === 0
  const hasCompare = compareSeries.length > 0

  return (
    <Card className="min-w-0 overflow-hidden shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">{t("chart.profit")}</CardTitle>
      </CardHeader>
      <CardContent className="h-64 min-w-0 pt-0 sm:h-80">
        {empty ? (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t("emptyHint")}
          </p>
        ) : (
          <ChartContainer
            config={{
              revenue: { label: t("revenue"), color: "var(--color-chart-1)" },
              cogs: { label: t("kpi.cogs"), color: "var(--color-chart-2)" },
              profit: { label: t("kpi.grossProfit"), color: "var(--color-chart-3)" },
              compareProfit: { label: t("comparePeriod"), color: "var(--color-chart-4)" },
            }}
            className="h-full min-w-0 w-full"
          >
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis
                yAxisId="left"
                tickFormatter={axisFmt}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="revenue"
                stroke="var(--color-chart-1)"
                fill="var(--color-chart-1)"
                fillOpacity={0.12}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="cogs"
                stroke="var(--color-chart-2)"
                fill="var(--color-chart-2)"
                fillOpacity={0.12}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="profit"
                stroke="var(--color-chart-3)"
                strokeWidth={2}
                dot={false}
              />
              {hasCompare ? (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="compareProfit"
                  stroke="var(--color-chart-4)"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                />
              ) : null}
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
