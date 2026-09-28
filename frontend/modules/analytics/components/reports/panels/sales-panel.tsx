"use client"

import { useTranslations } from "next-intl"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"

import { useReportFormat } from "../format"
import { PriceTierChart, ProfitChart } from "../report-charts"
import { ReportKpiGrid } from "../report-kpi-grid"
import type { SalesReport } from "../types"
import { useReportList, useReportQuery } from "../use-report-filters"
import { ListCard } from "./list-panel"
import { PanelState, type ReportPanelProps } from "./panel-state"

export function SalesPanel({ filters }: ReportPanelProps) {
  const t = useTranslations("reports")
  const fmt = useReportFormat()
  const list = useReportList("profit")
  const q = useReportQuery<SalesReport>("sales", filters, list.params)

  return (
    <PanelState q={q}>
      {(data) => {
        const c = data.currency
        const money = (v: number) => <MoneyDisplay amount={v} currency={c} />
        const target = Number(data.summary?.target_margin_pct ?? 0)
        const actual = Number(data.summary?.gross_margin_pct ?? 0)
        return (
          <div className="space-y-6">
            {target > 0 ? (
              <p
                className={
                  actual >= target ? "text-sm text-emerald-600" : "text-sm text-amber-600"
                }
              >
                {t("targetMarginHint", { target: fmt.dec(target), actual: fmt.dec(actual) })}
              </p>
            ) : null}
            <ReportKpiGrid summary={data.summary} compareSummary={data.compare?.summary} currency={c} />
            <div className="grid min-w-0 gap-4 xl:grid-cols-2">
              <ProfitChart series={data.series} compareSeries={data.compare?.series} currency={c} />
              <PriceTierChart rows={data.by_price_tier ?? []} currency={c} />
            </div>
            <ListCard
              list={list}
              data={data}
              rowKey={(r) => r.id}
              loading={q.isFetching}
              columns={[
                { id: "name", header: t("table.product"), sortable: true, cell: (r) => r.name },
                { id: "quantity", header: t("table.quantity"), align: "end", sortable: true, cell: (r) => fmt.num(r.quantity) },
                { id: "avg_cost", header: t("table.purchasePrice"), align: "end", sortable: true, cell: (r) => money(r.avg_cost) },
                { id: "avg_sell_price", header: t("table.sellPrice"), align: "end", sortable: true, cell: (r) => money(r.avg_sell_price) },
                { id: "revenue", header: t("revenue"), align: "end", sortable: true, cell: (r) => money(r.revenue) },
                { id: "cogs", header: t("table.cogs"), align: "end", sortable: true, cell: (r) => money(r.cogs) },
                { id: "profit", header: t("table.profit"), align: "end", sortable: true, cell: (r) => money(r.profit) },
                {
                  id: "margin_pct",
                  header: t("table.margin"),
                  align: "end",
                  sortable: true,
                  cell: (r) => (
                    <span className={target > 0 && r.margin_pct < target ? "text-amber-600" : undefined}>
                      {fmt.pct(r.margin_pct)}
                    </span>
                  ),
                },
              ]}
            />
          </div>
        )
      }}
    </PanelState>
  )
}
