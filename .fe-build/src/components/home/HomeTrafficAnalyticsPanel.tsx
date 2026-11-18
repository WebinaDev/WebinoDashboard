"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { CartesianGrid, Legend, Line, LineChart, XAxis, YAxis } from "recharts"

import { ChangePctBadge } from "@/components/home/ChangePctBadge"
import { HomeTrafficPeriodsTable } from "@/components/home/HomeTrafficPeriodsTable"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { formatSeriesKey } from "../../../modules/analytics/components/reports/format"
import { formatDate, formatNumber, normalizeUiLocale } from "@/lib/locale"
import type { DashboardOverviewTraffic } from "@/types/dashboardOverview"

const PERIOD_IDS = ["last7_excl_today", "last14_excl_today", "all_time"] as const

type HomeTrafficAnalyticsPanelProps = {
  traffic: DashboardOverviewTraffic
  locale: string
}

function formatDayLabel(day: string, locale: string) {
  return formatDate(`${day}T12:00:00`, normalizeUiLocale(locale), { dateStyle: "medium" })
}

function seriesHasHits(series: { visitors?: number; views?: number }[] | undefined) {
  if (!series?.length) return false
  return series.some((r) => (r.visitors ?? 0) > 0 || (r.views ?? 0) > 0)
}

export function HomeTrafficAnalyticsPanel({
  traffic,
  locale,
}: HomeTrafficAnalyticsPanelProps) {
  const t = useTranslations("home")
  const tAnalytics = useTranslations("analytics")
  const lng = normalizeUiLocale(locale)

  const chartData = useMemo(
    () =>
      (traffic.chart?.series ?? []).map((r) => ({
        ...r,
        label: formatDayLabel(r.day, locale),
      })),
    [traffic.chart?.series, locale],
  )

  const displayPeriods = useMemo(
    () =>
      (traffic.periods ?? []).filter((p) =>
        (PERIOD_IDS as readonly string[]).includes(p.id),
      ),
    [traffic.periods],
  )

  const hasHits =
    traffic.active !== false &&
    (traffic.online > 0 ||
      (traffic.highlight?.visitors ?? 0) > 0 ||
      (traffic.highlight?.views ?? 0) > 0 ||
      (traffic.all_time?.views ?? 0) > 0 ||
      seriesHasHits(traffic.chart?.series))

  const showEmpty = traffic.active === false || !hasHits
  const recentDays = useMemo(
    () => (traffic.chart?.series ?? []).slice(-2).reverse(),
    [traffic.chart?.series],
  )

  const axisFmt = (v: number | string) =>
    formatNumber(typeof v === "number" ? v : Number(v) || 0, lng)

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base font-medium">{t("sections.traffic")}</CardTitle>
          {traffic.source === "wp-statistics" ? (
            <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("traffic.source_wp_statistics")}
            </span>
          ) : traffic.source === "native" ? (
            <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("traffic.source_native")}
            </span>
          ) : null}
        </div>
        <Button asChild variant="outline" size="sm" className="h-7 text-xs">
          <Link href="/dashboard/analytics/overview">{t("traffic.view_details")}</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {showEmpty ? (
          <div className="space-y-3 rounded-lg border border-dashed px-4 py-6 text-center">
            <p className="text-sm font-medium">
              {traffic.active === false
                ? t("disabled.analytics")
                : t("traffic.empty_title")}
            </p>
            <p className="text-sm text-muted-foreground">{t("traffic.empty_hint")}</p>
            <p className="text-xs text-muted-foreground">
              {traffic.source === "wp-statistics"
                ? t("traffic.wp_statistics_hint")
                : t("traffic.tracker_hint")}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/analytics/overview">
                  {t("traffic.open_analytics_settings")}
                </Link>
              </Button>
              {traffic.active === false ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/dashboard/settings">{t("disabled.open_settings")}</Link>
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">{t("traffic.online_visitors")}</p>
                <p className="text-3xl font-semibold tracking-tight">
                  {formatNumber(traffic.online, lng)}
                </p>
              </div>

              <div className="space-y-3 lg:col-span-2">
                <div>
                  <p className="text-sm font-medium">{t("traffic.last7_excl_today")}</p>
                  <p className="text-xs text-muted-foreground">{t("traffic.vs_prev_period")}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">{tAnalytics("kpi.visitors")}</p>
                    <div className="mt-1 flex flex-wrap items-baseline gap-2">
                      <span className="text-xl font-semibold">
                        {formatNumber(traffic.highlight.visitors, lng)}
                      </span>
                      <ChangePctBadge value={traffic.highlight.visitors_change_pct} />
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">{tAnalytics("kpi.views")}</p>
                    <div className="mt-1 flex flex-wrap items-baseline gap-2">
                      <span className="text-xl font-semibold">
                        {formatNumber(traffic.highlight.views, lng)}
                      </span>
                      <ChangePctBadge value={traffic.highlight.views_change_pct} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">{t("traffic.chart_title")}</p>
              <div className="h-44 min-h-0 min-w-0">
                {chartData.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    {tAnalytics("emptyChart")}
                  </p>
                ) : (
                  <ChartContainer
                    config={{
                      visitors: {
                        label: tAnalytics("kpi.visitors"),
                        color: "var(--color-chart-1)",
                      },
                      views: {
                        label: tAnalytics("kpi.views"),
                        color: "var(--color-chart-2)",
                      },
                    }}
                    className="h-full min-h-[8rem] w-full"
                  >
                    <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10 }}
                        interval="preserveStartEnd"
                        tickFormatter={(v) => formatSeriesKey(String(v), lng, String(v))}
                      />
                      <YAxis tickFormatter={axisFmt} tick={{ fontSize: 10 }} width={48} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="visitors"
                        stroke="var(--color-chart-1)"
                        strokeWidth={2}
                        dot={false}
                        name={tAnalytics("kpi.visitors")}
                      />
                      <Line
                        type="monotone"
                        dataKey="views"
                        stroke="var(--color-chart-2)"
                        strokeWidth={2}
                        dot={false}
                        name={tAnalytics("kpi.views")}
                      />
                    </LineChart>
                  </ChartContainer>
                )}
              </div>
            </div>

            {recentDays.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">{t("traffic.recent_days")}</p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {recentDays.map((day) => (
                    <li key={day.day} className="rounded-lg border px-3 py-2 text-sm">
                      <p className="font-medium">{formatDayLabel(day.day, locale)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {tAnalytics("kpi.visitors")}: {formatNumber(day.visitors, lng)} —{" "}
                        {tAnalytics("kpi.views")}: {formatNumber(day.views, lng)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {displayPeriods.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-medium">{t("traffic.periods_title")}</p>
                <HomeTrafficPeriodsTable periods={displayPeriods} locale={locale} embedded />
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              {t("traffic.tracker_hint")}{" "}
              <Link href="/dashboard/analytics/overview" className="underline underline-offset-2">
                {t("traffic.open_analytics_settings")}
              </Link>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
