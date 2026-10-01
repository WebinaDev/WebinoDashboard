"use client"

import { TrendingDown, TrendingUp } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { Card, CardContent } from "@/components/ui/card"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import type { OrderReportSummary } from "@/types/dashboardOverview"
import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { localizeDigits } from "@/lib/digits"

type HomeKpiStripProps = {
  summary: OrderReportSummary
  compareSummary?: OrderReportSummary
  currency?: string
  locale: string
}

const HOME_KPIS: Array<{
  key: keyof OrderReportSummary
  labelKey:
    | "kpi.revenue"
    | "kpi.gross_profit"
    | "kpi.aov"
    | "kpi.orders"
    | "kpi.items_sold"
    | "kpi.gross_margin"
  money?: boolean
  percent?: boolean
}> = [
  { key: "revenue", labelKey: "kpi.revenue", money: true },
  { key: "gross_profit", labelKey: "kpi.gross_profit", money: true },
  { key: "avg_order_value", labelKey: "kpi.aov", money: true },
  { key: "order_count", labelKey: "kpi.orders" },
  { key: "items_sold", labelKey: "kpi.items_sold" },
  { key: "gross_margin_pct", labelKey: "kpi.gross_margin", percent: true },
]

function pctDelta(current: number, previous?: number): number | null {
  if (previous === undefined) return null
  if (previous === 0) return current > 0 ? 100 : null
  return ((current - previous) / previous) * 100
}

function Delta({ current, previous }: { current: number; previous?: number }) {
  const t = useTranslations("reports")
  const locale = useLocale()
  if (previous === undefined) return null
  const delta = pctDelta(current, previous)
  if (delta === null) {
    return (
      <span className="text-[10px] text-muted-foreground">{t("deltaNew")}</span>
    )
  }
  const up = delta >= 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] ${up ? "text-emerald-600" : "text-red-600"}`}
    >
      <Icon className="size-3" />
      {localizeDigits(Math.abs(delta).toFixed(1), locale)}%
    </span>
  )
}

export function HomeKpiStrip({
  summary,
  compareSummary,
  currency,
  locale,
}: HomeKpiStripProps) {
  const t = useTranslations("home")
  const tReports = useTranslations("reports")
  const lng = normalizeUiLocale(locale)

  if (!summary || typeof summary !== "object") {
    return null
  }

  return (
    <section className="space-y-2" aria-label={t("sections.sales")}>
      <h2 className="text-sm font-semibold tracking-tight">{t("sections.kpis")}</h2>
      <div className="flex gap-2.5 overflow-x-auto pb-1 md:grid md:grid-cols-3 md:overflow-visible md:pb-0 xl:grid-cols-6">
        {HOME_KPIS.map((kpi) => {
          const value = Number(summary[kpi.key] ?? 0)
          const prev = compareSummary?.[kpi.key]
          return (
            <Card key={kpi.key} variant="stat" className="wd-mini-tint min-w-[9.5rem] shrink-0 overflow-hidden md:min-w-0">
              <CardContent className="space-y-1 pb-3 pt-3.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {tReports(
                    kpi.labelKey === "kpi.revenue"
                      ? "kpi.revenue"
                      : kpi.labelKey === "kpi.gross_profit"
                        ? "kpi.grossProfit"
                        : kpi.labelKey === "kpi.aov"
                          ? "kpi.aov"
                          : kpi.labelKey === "kpi.orders"
                            ? "kpi.orders"
                            : kpi.labelKey === "kpi.items_sold"
                              ? "kpi.itemsSold"
                              : "kpi.grossMargin",
                  )}
                </p>
                <div className="flex items-baseline justify-between gap-1.5">
                  {kpi.money ? (
                    <p className="text-base font-semibold tracking-tight sm:text-lg">
                      <MoneyDisplay amount={value} currency={currency} />
                    </p>
                  ) : kpi.percent ? (
                    <p className="text-base font-semibold tracking-tight sm:text-lg">
                      {localizeDigits(value.toFixed(1), lng)}%
                    </p>
                  ) : (
                    <p className="text-base font-semibold tracking-tight sm:text-lg">
                      {formatNumber(value, lng)}
                    </p>
                  )}
                  <Delta
                    current={value}
                    previous={prev !== undefined ? Number(prev) : undefined}
                  />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
