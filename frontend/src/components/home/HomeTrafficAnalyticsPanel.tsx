"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Area, CartesianGrid, ComposedChart, XAxis, YAxis } from "recharts"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer } from "@/components/ui/chart"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import type { DashboardOverviewTraffic } from "@/types/dashboardOverview"

type HomeTrafficAnalyticsPanelProps = {
  traffic: DashboardOverviewTraffic
  locale: string
}

export function HomeTrafficAnalyticsPanel({
  traffic,
  locale,
}: HomeTrafficAnalyticsPanelProps) {
  const t = useTranslations("home")
  const lng = normalizeUiLocale(locale)
  const chartData = useMemo(
    () =>
      (traffic.chart?.series ?? []).map((row) => ({
        day: row.day,
        visitors: row.visitors,
        views: row.views,
      })),
    [traffic.chart?.series],
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{t("sections.traffic")}</CardTitle>
        <Button asChild variant="outline" size="sm" className="h-7 text-xs">
          <Link href="/dashboard/analytics/overview">{t("traffic.view_details")}</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{t("traffic.online_now")}</p>
            <p className="text-xl font-semibold">
              {formatNumber(traffic.online, lng)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {t("traffic.highlight_visitors")}
            </p>
            <p className="text-xl font-semibold">
              {formatNumber(traffic.highlight.visitors, lng)}
            </p>
          </div>
        </div>
        <div className="h-28 sm:h-36">
          {chartData.length === 0 ? (
            <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
              {t("traffic.empty_hint")}
            </p>
          ) : (
            <ChartContainer
              config={{
                visitors: { label: t("traffic.online_visitors"), color: "var(--color-chart-2)" },
                views: { label: t("sections.traffic"), color: "var(--color-chart-1)" },
              }}
              className="h-full min-h-[7rem] w-full"
            >
              <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="day" hide />
                <YAxis hide />
                <Area
                  type="monotone"
                  dataKey="views"
                  stroke="var(--color-chart-1)"
                  fill="var(--color-chart-1)"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="visitors"
                  stroke="var(--color-chart-2)"
                  fill="var(--color-chart-2)"
                  fillOpacity={0.15}
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
