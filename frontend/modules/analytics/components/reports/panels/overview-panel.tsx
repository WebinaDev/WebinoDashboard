"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { Badge } from "@/components/ui/badge"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import { BasalamBalanceCard } from "../basalam-balance-card"
import { useReportFormat } from "../format"
import { CHART_COLORS, ChartCard, ChartEmpty, useSeriesRows } from "../report-charts"
import { ReportKpiGrid } from "../report-kpi-grid"
import { TopTable } from "../top-table"
import type { OrdersReport, ReportSeriesPoint } from "../types"
import { useReportQuery } from "../use-report-filters"
import { PanelState, type ReportPanelProps } from "./panel-state"

const METRICS = ["revenue", "net", "orders", "items", "refunds", "coupons", "tax", "shipping", "profit", "cogs"] as const
type Metric = (typeof METRICS)[number]
const MONEY_METRICS: Metric[] = ["revenue", "net", "refunds", "coupons", "tax", "shipping", "profit", "cogs"]

function metricValue(row: ReportSeriesPoint | undefined, m: Metric): number {
  return row ? Number(row[m] ?? 0) : 0
}

function PerformanceChart({ data }: { data: OrdersReport }) {
  const t = useTranslations("reports")
  const fmt = useReportFormat()
  const [metric, setMetric] = useState<Metric>("revenue")
  const hasCompare = Boolean(data.compare?.series?.length)
  const rows = useSeriesRows(data.series, data.compare?.series, (r, p) => ({
    value: metricValue(r, metric),
    compare: metricValue(p, metric),
  }))
  const isMoney = MONEY_METRICS.includes(metric)
  const config: ChartConfig = {
    value: { label: t(`metric.${metric}`), color: CHART_COLORS[0] },
    compare: { label: t("comparePeriod"), color: "var(--color-muted-foreground)" },
  }

  return (
    <ChartCard
      title={t("chart.overview")}
      contentClassName="sm:h-80"
      action={
        <div className="w-48">
          <Select value={metric} onValueChange={(v) => setMetric(v as Metric)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METRICS.map((m) => (
                <SelectItem key={m} value={m}>
                  {t(`metric.${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    >
      {rows.length === 0 ? (
        <ChartEmpty />
      ) : (
        <ChartContainer config={config} className="aspect-auto h-full w-full min-w-0">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
            <YAxis tickFormatter={(v) => fmt.num(v)} tickLine={false} axisLine={false} width={72} />
            <ChartTooltip
              content={(p) => {
                const items = p.payload as Array<{ dataKey?: string; value?: number }> | undefined
                if (!p.active || !items?.length) return null
                return (
                  <div className="bg-background grid min-w-[9rem] gap-1 rounded-lg border px-2.5 py-1.5 text-xs shadow-md">
                    <div className="font-medium">{String(p.label ?? "")}</div>
                    {items.map((it) => (
                      <div key={String(it.dataKey)} className="flex justify-between gap-3">
                        <span className="text-muted-foreground">{config[String(it.dataKey)]?.label}</span>
                        <span dir="ltr" className="tabular-nums">
                          {isMoney ? fmt.money(it.value, data.currency) : fmt.num(it.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              }}
            />
            <Area type="monotone" dataKey="value" stroke="var(--color-value)" fill="var(--color-value)" fillOpacity={0.2} strokeWidth={2} />
            {hasCompare ? (
              <Line type="monotone" dataKey="compare" stroke="var(--color-compare)" strokeDasharray="4 4" dot={false} />
            ) : null}
          </ComposedChart>
        </ChartContainer>
      )}
    </ChartCard>
  )
}

export function OverviewPanel({ filters }: ReportPanelProps) {
  const t = useTranslations("reports")
  const fmt = useReportFormat()
  const q = useReportQuery<OrdersReport>("overview", filters)

  return (
    <PanelState q={q}>
      {(data) => {
        const money = (v: number) => <MoneyDisplay amount={v} currency={data.currency} />
        return (
          <div className="space-y-6">
            <ReportKpiGrid summary={data.summary} compareSummary={data.compare?.summary} currency={data.currency} />
            <BasalamBalanceCard />
            <PerformanceChart data={data} />
            <div className="grid min-w-0 gap-4 lg:grid-cols-2 xl:grid-cols-3">
              <TopTable
                title={t("table.topProductsProfit")}
                rows={data.top_products_profit ?? []}
                rowKey={(r) => r.id}
                columns={[
                  {
                    id: "name",
                    header: t("table.product"),
                    cell: (r) => (
                      <span className="inline-flex flex-wrap items-center gap-1">
                        {r.name}
                        {r.missing_cost_qty > 0 ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {t("table.missingCostQty", { count: fmt.num(r.missing_cost_qty) })}
                          </Badge>
                        ) : null}
                      </span>
                    ),
                  },
                  { id: "profit", header: t("table.profit"), align: "end", cell: (r) => money(r.profit) },
                  { id: "margin", header: t("table.margin"), align: "end", cell: (r) => fmt.pct(r.margin_pct) },
                ]}
              />
              <TopTable
                title={t("table.topProducts")}
                rows={data.top_products ?? []}
                rowKey={(r) => r.id}
                columns={[
                  { id: "name", header: t("table.product"), cell: (r) => r.name },
                  { id: "qty", header: t("table.quantity"), align: "end", cell: (r) => fmt.num(r.quantity) },
                  { id: "revenue", header: t("revenue"), align: "end", cell: (r) => money(r.revenue) },
                ]}
              />
              <TopTable
                title={t("table.topCategories")}
                rows={data.top_categories ?? []}
                rowKey={(r) => r.id}
                columns={[
                  { id: "name", header: t("table.category"), cell: (r) => r.name },
                  { id: "qty", header: t("table.quantity"), align: "end", cell: (r) => fmt.num(r.quantity) },
                  { id: "revenue", header: t("revenue"), align: "end", cell: (r) => money(r.revenue) },
                ]}
              />
              <TopTable
                title={t("table.topCustomers")}
                rows={data.top_customers ?? []}
                rowKey={(r, i) => `${r.email}-${i}`}
                columns={[
                  {
                    id: "name",
                    header: t("table.customer"),
                    cell: (r) => (
                      <div className="min-w-0">
                        <div>{r.name || "—"}</div>
                        {r.email ? <div className="text-muted-foreground text-xs" dir="ltr">{r.email}</div> : null}
                      </div>
                    ),
                  },
                  { id: "orders", header: t("orders"), align: "end", cell: (r) => fmt.num(r.orders) },
                  { id: "revenue", header: t("revenue"), align: "end", cell: (r) => money(r.revenue) },
                ]}
              />
              <TopTable
                title={t("table.topCoupons")}
                rows={data.top_coupons ?? []}
                rowKey={(r) => r.code}
                columns={[
                  { id: "code", header: t("table.coupon"), cell: (r) => <span dir="ltr">{r.code}</span> },
                  { id: "count", header: t("table.usage"), align: "end", cell: (r) => fmt.num(r.count) },
                  { id: "discount", header: t("kpi.discounts"), align: "end", cell: (r) => money(r.discount) },
                ]}
              />
            </div>
          </div>
        )
      }}
    </PanelState>
  )
}
