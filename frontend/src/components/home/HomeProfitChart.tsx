"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer } from "@/components/ui/chart"
import type { OrderReportSeriesPoint } from "@/types/dashboardOverview"

type ProfitChartProps = {
  series: OrderReportSeriesPoint[]
  compareSeries?: OrderReportSeriesPoint[]
  locale: string
}

export function HomeProfitChart({ series, compareSeries = [] }: ProfitChartProps) {
  const t = useTranslations("reports")
  const chartData = useMemo(
    () =>
      series.map((row, idx) => ({
        label: row.label,
        revenue: row.revenue,
        cogs: row.cogs,
        profit: row.profit,
        compareProfit: compareSeries[idx]?.profit ?? 0,
      })),
    [series, compareSeries],
  )

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{t("chart.profit")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-28 sm:h-36">
          {chartData.length === 0 ? (
            <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
              {t("emptyHint")}
            </p>
          ) : (
            <ChartContainer
              config={{
                revenue: { label: t("revenue"), color: "var(--color-chart-1)" },
                cogs: { label: t("kpi.cogs"), color: "var(--color-chart-4)" },
                profit: { label: t("kpi.grossProfit"), color: "var(--color-chart-2)" },
              }}
              className="h-full min-h-[7rem] w-full"
            >
              <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" hide />
                <YAxis hide />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-chart-1)"
                  fill="var(--color-chart-1)"
                  fillOpacity={0.15}
                  strokeWidth={1.5}
                />
                <Line
                  type="monotone"
                  dataKey="cogs"
                  stroke="var(--color-chart-4)"
                  dot={false}
                  strokeWidth={1.5}
                />
                <Line
                  type="monotone"
                  dataKey="profit"
                  stroke="var(--color-chart-2)"
                  dot={false}
                  strokeWidth={2}
                />
              </ComposedChart>
            </ChartContainer>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
