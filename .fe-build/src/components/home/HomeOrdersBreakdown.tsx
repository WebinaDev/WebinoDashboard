"use client"

import { useTranslations } from "next-intl"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { useEnumLabel } from "@/lib/enum-labels"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"

type HomeOrdersBreakdownProps = {
  locale: string
  byStatus?: Array<{ status: string; orders: number; revenue: number }>
  byPayment?: Array<{ method: string; orders: number; revenue: number }>
  byHour?: Array<{ hour: number; orders: number; revenue: number }>
}

export function HomeOrdersBreakdown({
  locale,
  byStatus = [],
  byPayment = [],
  byHour = [],
}: HomeOrdersBreakdownProps) {
  const enumLabel = useEnumLabel()
  const t = useTranslations("home")
  const tReports = useTranslations("reports")
  const lng = normalizeUiLocale(locale)

  const hourData = byHour.map((h) => ({
    hour: formatNumber(h.hour, lng),
    orders: h.orders,
  }))

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold tracking-tight">{t("sections.breakdown")}</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {tReports("chart.byStatus")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {byStatus.length === 0 ? (
              <p className="text-muted-foreground">{tReports("emptyHint")}</p>
            ) : (
              byStatus.map((row) => (
                <div key={row.status} className="flex justify-between gap-2">
                  <span>{enumLabel("order_status", row.status)}</span>
                  <span className="font-medium tabular-nums">
                    {formatNumber(row.orders, lng)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {tReports("chart.byPayment")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {byPayment.length === 0 ? (
              <p className="text-muted-foreground">{tReports("emptyHint")}</p>
            ) : (
              byPayment.map((row) => (
                <div key={row.method} className="flex justify-between gap-2">
                  <span>{row.method}</span>
                  <span className="font-medium tabular-nums">
                    {formatNumber(row.orders, lng)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {tReports("chart.byHour")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-28">
              {hourData.every((h) => h.orders === 0) ? (
                <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  {tReports("emptyHint")}
                </p>
              ) : (
                <ChartContainer
                  config={{ orders: { label: tReports("orders"), color: "var(--color-chart-3)" } }}
                  className="h-full w-full"
                >
                  <BarChart data={hourData}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="hour" hide />
                    <YAxis hide />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="orders" fill="var(--color-chart-3)" radius={2} />
                  </BarChart>
                </ChartContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
