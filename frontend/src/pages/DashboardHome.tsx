"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { LocaleDatePicker } from "@/components/LocaleDatePicker"
import { api } from "@/lib/api"
import { formatInteger, formatLocalizedDate, formatNowDate } from "@/lib/format"

type Summary = {
  orders_open: number
  orders_paid: number
  products: number
  revenue_minor: number
}

export default function DashboardHome() {
  const { t, i18n } = useTranslation(["dashboard", "common"])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [picked, setPicked] = useState<Date | null>(() => new Date())

  useEffect(() => {
    let cancelled = false
    api<{ data: Summary }>("/api/v1/analytics/summary")
      .then((r) => {
        if (!cancelled) {
          setSummary(r.data)
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
  }, [])

  const lng = i18n.language.startsWith("fa") ? "fa" : "en"

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("dashboard:title")}</h1>
        <p className="text-muted-foreground text-sm">
          {t("dashboard:sample_date_label")}: {formatNowDate(lng)}
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <span className="text-muted-foreground text-sm">
            {t("dashboard:pick_date_label")}
          </span>
          <LocaleDatePicker
            locale={i18n.language}
            value={picked}
            onChange={setPicked}
            aria-label={t("dashboard:pick_date_label")}
          />
          <span className="text-muted-foreground text-sm">
            {t("dashboard:selected_date_label")}:{" "}
            {picked ? formatLocalizedDate(lng, picked) : t("common:em_dash")}
          </span>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border bg-card p-4 text-card-foreground shadow">
          <div className="text-muted-foreground text-sm">
            {t("dashboard:kpi_orders_open")}
          </div>
          <div className="text-2xl font-semibold">
            {summary ? formatInteger(summary.orders_open, lng) : t("common:em_dash")}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-card-foreground shadow">
          <div className="text-muted-foreground text-sm">
            {t("dashboard:kpi_orders_paid")}
          </div>
          <div className="text-2xl font-semibold">
            {summary ? formatInteger(summary.orders_paid, lng) : t("common:em_dash")}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-card-foreground shadow">
          <div className="text-muted-foreground text-sm">
            {t("dashboard:kpi_products")}
          </div>
          <div className="text-2xl font-semibold">
            {summary ? formatInteger(summary.products, lng) : t("common:em_dash")}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-card-foreground shadow">
          <div className="text-muted-foreground text-sm">
            {t("dashboard:kpi_revenue")}
          </div>
          <div className="text-2xl font-semibold">
            {summary ? formatInteger(summary.revenue_minor, lng) : t("common:em_dash")}
          </div>
        </div>
      </div>
    </div>
  )
}
