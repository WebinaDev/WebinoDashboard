"use client"

import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"

import { AccentBarChart } from "@/components/charts/AccentCharts"
import { LocaleDatePicker } from "@/components/LocaleDatePicker"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { api } from "@/lib/api"
import { formatDate, formatNumber, normalizeUiLocale } from "@/lib/locale"

type Summary = {
  orders_open: number
  orders_paid: number
  products: number
  revenue_minor: number
}

type Props = {
  initialSummary?: Summary | null
}

export default function DashboardHome({ initialSummary = null }: Props) {
  const t = useTranslations("dashboard")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const lng = normalizeUiLocale(locale)
  const [summary, setSummary] = useState<Summary | null>(initialSummary)
  const [picked, setPicked] = useState<string | null>(() =>
    new Date().toISOString().slice(0, 10),
  )

  useEffect(() => {
    if (initialSummary) {
      return
    }
    let cancelled = false
    api<Summary>("/api/v1/analytics/summary")
      .then((data) => {
        if (!cancelled) {
          setSummary(data)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSummary(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [initialSummary])

  const kpis = [
    {
      key: "orders_open",
      label: t("kpi_orders_open"),
      value: summary ? formatNumber(summary.orders_open, lng) : tCommon("em_dash"),
    },
    {
      key: "orders_paid",
      label: t("kpi_orders_paid"),
      value: summary ? formatNumber(summary.orders_paid, lng) : tCommon("em_dash"),
    },
    {
      key: "products",
      label: t("kpi_products"),
      value: summary ? formatNumber(summary.products, lng) : tCommon("em_dash"),
    },
    {
      key: "revenue",
      label: t("kpi_revenue"),
      value: summary
        ? formatNumber(summary.revenue_minor, lng)
        : tCommon("em_dash"),
    },
  ] as const

  return (
    <div className="space-y-5">
      <header className="wd-home-hero relative z-0 space-y-1.5">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {formatDate(new Date(), lng)}
        </p>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t("welcome")}
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
          {t("title")}
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <span className="text-muted-foreground text-sm">
            {t("pick_date_label")}
          </span>
          <LocaleDatePicker
            locale={locale}
            value={picked}
            onChange={setPicked}
            aria-label={t("pick_date_label")}
          />
          <span className="text-muted-foreground text-sm">
            {t("selected_date_label")}:{" "}
            {picked ? formatDate(picked, lng) : tCommon("em_dash")}
          </span>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 sm:gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.key} variant="stat" className="wd-mini-tint">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-muted-foreground text-xs font-medium">
                {kpi.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-2xl font-semibold tracking-tight">
                {kpi.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {summary ? (
        <Card variant="glass">
          <CardContent className="p-4">
            <AccentBarChart
              data={[
                { label: t("kpi_orders_open"), value: summary.orders_open },
                { label: t("kpi_orders_paid"), value: summary.orders_paid },
                { label: t("kpi_products"), value: summary.products },
              ]}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
