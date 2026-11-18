"use client"

import { useTranslations } from "next-intl"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"

import { useReportFormat } from "../format"
import { RevenueOrdersChart } from "../report-charts"
import { ReportKpiGrid } from "../report-kpi-grid"
import { TopTable } from "../top-table"
import type { ReportBase } from "../types"
import { useReportQuery } from "../use-report-filters"
import { PanelState, type ReportPanelProps } from "./panel-state"

export function RevenuePanel({ filters }: ReportPanelProps) {
  const t = useTranslations("reports")
  const fmt = useReportFormat()
  const q = useReportQuery<ReportBase>("revenue", filters)

  return (
    <PanelState q={q}>
      {(data) => {
        const money = (v: number) => <MoneyDisplay amount={v} currency={data.currency} />
        return (
          <div className="space-y-6">
            <ReportKpiGrid summary={data.summary} compareSummary={data.compare?.summary} currency={data.currency} />
            <RevenueOrdersChart series={data.series} compareSeries={data.compare?.series} currency={data.currency} />
            <TopTable
              title={t("table.intervals")}
              rows={data.series}
              rowKey={(r) => r.key}
              columns={[
                { id: "period", header: t("table.period"), cell: (r) => fmt.seriesLabel(r.key, r.label) },
                { id: "revenue", header: t("kpi.revenue"), align: "end", cell: (r) => money(r.revenue) },
                { id: "net", header: t("metric.net"), align: "end", cell: (r) => money(r.net) },
                { id: "refunds", header: t("kpi.refunds"), align: "end", cell: (r) => money(r.refunds) },
                { id: "coupons", header: t("kpi.discounts"), align: "end", cell: (r) => money(r.coupons) },
                { id: "tax", header: t("kpi.tax"), align: "end", cell: (r) => money(r.tax) },
                { id: "shipping", header: t("kpi.shipping"), align: "end", cell: (r) => money(r.shipping) },
                { id: "orders", header: t("orders"), align: "end", cell: (r) => fmt.num(r.orders) },
              ]}
            />
          </div>
        )
      }}
    </PanelState>
  )
}
