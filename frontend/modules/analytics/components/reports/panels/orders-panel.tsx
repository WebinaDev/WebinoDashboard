"use client"

import { useTranslations } from "next-intl"

import { useReportFormat } from "../format"
import { HBarChart, HourlyBar, StatusPie } from "../report-charts"
import { KpiCard, ReportKpiGrid } from "../report-kpi-grid"
import type { OrdersReport } from "../types"
import { useReportQuery } from "../use-report-filters"
import { WeekHourHeatmap } from "../week-hour-heatmap"
import { PanelState, type ReportPanelProps } from "./panel-state"

export function OrdersPanel({ filters }: ReportPanelProps) {
  const t = useTranslations("reports")
  const fmt = useReportFormat()
  const q = useReportQuery<OrdersReport>("orders", filters)

  return (
    <PanelState q={q}>
      {(data) => (
        <div className="space-y-6">
          <ReportKpiGrid summary={data.summary} compareSummary={data.compare?.summary} currency={data.currency} />
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard label={t("itemsPerOrder")} value={fmt.dec(data.summary.items_per_order, 2)} />
            <KpiCard label={t("kpi.newCustomers")} value={fmt.num(data.summary.new_customers)} />
            <KpiCard label={t("kpi.returningCustomers")} value={fmt.num(data.summary.returning_customers)} />
          </div>
          <WeekHourHeatmap cells={data.heatmap ?? []} currency={data.currency} />
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <StatusPie rows={data.by_status ?? []} currency={data.currency} />
            <HBarChart
              title={t("chart.byPayment")}
              rows={(data.by_payment ?? []).map((r) => ({ name: r.title || r.method, value: r.revenue }))}
              valueLabel={t("revenue")}
              money
              currency={data.currency}
            />
            <HBarChart
              title={t("chart.bySource")}
              rows={(data.by_source ?? []).map((r) => ({ name: fmt.sourceLabel(r.source), value: r.revenue }))}
              valueLabel={t("revenue")}
              money
              currency={data.currency}
            />
            <HourlyBar rows={data.by_hour ?? []} currency={data.currency} />
          </div>
        </div>
      )}
    </PanelState>
  )
}
