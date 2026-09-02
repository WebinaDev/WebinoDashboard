"use client"

import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"

import { AccentBarChart } from "@/components/charts/AccentCharts"
import { LocaleDatePicker } from "@/components/LocaleDatePicker"
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">
          {t("sample_date_label")}: {formatDate(new Date(), lng)}
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
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
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border bg-card p-4 text-card-foreground shadow">
          <div className="text-muted-foreground text-sm">
            {t("kpi_orders_open")}
          </div>
          <div className="text-2xl font-semibold">
            {summary ? formatNumber(summary.orders_open, lng) : tCommon("em_dash")}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-card-foreground shadow">
          <div className="text-muted-foreground text-sm">
            {t("kpi_orders_paid")}
          </div>
          <div className="text-2xl font-semibold">
            {summary ? formatNumber(summary.orders_paid, lng) : tCommon("em_dash")}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-card-foreground shadow">
          <div className="text-muted-foreground text-sm">
            {t("kpi_products")}
          </div>
          <div className="text-2xl font-semibold">
            {summary ? formatNumber(summary.products, lng) : tCommon("em_dash")}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-card-foreground shadow">
          <div className="text-muted-foreground text-sm">
            {t("kpi_revenue")}
          </div>
          <div className="text-2xl font-semibold">
            {summary ? formatNumber(summary.revenue_minor, lng) : tCommon("em_dash")}
          </div>
        </div>
      </div>
      {summary ? (
        <div className="rounded-xl border bg-card p-4 shadow">
          <AccentBarChart
            data={[
              { label: t("kpi_orders_open"), value: summary.orders_open },
              { label: t("kpi_orders_paid"), value: summary.orders_paid },
              { label: t("kpi_products"), value: summary.products },
            ]}
          />
        </div>
      ) : null}
    </div>
  )
}
