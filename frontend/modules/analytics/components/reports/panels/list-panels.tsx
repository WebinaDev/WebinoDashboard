"use client"

import { useTranslations } from "next-intl"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { Badge } from "@/components/ui/badge"

import { useReportFormat } from "../format"
import { KpiCard } from "../report-kpi-grid"
import type { ReportColumn } from "../report-data-table"
import type {
  CategoryRow,
  CouponRow,
  CustomerRow,
  DownloadRow,
  ListReport,
  ProductRow,
  TaxRow,
  VariationRow,
} from "../types"
import { useReportList, useReportQuery } from "../use-report-filters"
import { ListCard, ListPanel } from "./list-panel"
import type { ReportPanelProps } from "./panel-state"

function useMoney() {
  return (v: number, currency: string) => <MoneyDisplay amount={v} currency={currency} />
}

export function ProductsPanel({ filters }: ReportPanelProps) {
  const t = useTranslations("reports")
  const fmt = useReportFormat()
  const money = useMoney()
  return (
    <ListPanel<ProductRow>
      section="products"
      filters={filters}
      defaultOrderby="revenue"
      rowKey={(r) => r.id}
      columns={(c) => [
        {
          id: "name",
          header: t("table.product"),
          sortable: true,
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
        { id: "quantity", header: t("table.quantity"), align: "end", sortable: true, cell: (r) => fmt.num(r.quantity) },
        { id: "avg_sell_price", header: t("table.avgSell"), align: "end", sortable: true, cell: (r) => money(r.avg_sell_price, c) },
        { id: "avg_cost", header: t("table.avgCost"), align: "end", sortable: true, cell: (r) => money(r.avg_cost, c) },
        { id: "revenue", header: t("revenue"), align: "end", sortable: true, cell: (r) => money(r.revenue, c) },
        { id: "cogs", header: t("table.cogs"), align: "end", sortable: true, cell: (r) => money(r.cogs, c) },
        { id: "profit", header: t("table.profit"), align: "end", sortable: true, cell: (r) => money(r.profit, c) },
        { id: "margin_pct", header: t("table.margin"), align: "end", sortable: true, cell: (r) => fmt.pct(r.margin_pct) },
      ]}
    />
  )
}

export function VariationsPanel({ filters }: ReportPanelProps) {
  const t = useTranslations("reports")
  const fmt = useReportFormat()
  const money = useMoney()
  return (
    <ListPanel<VariationRow>
      section="variations"
      filters={filters}
      defaultOrderby="revenue"
      rowKey={(r) => r.id}
      columns={(c) => [
        { id: "name", header: t("table.variation"), sortable: true, cell: (r) => r.name },
        { id: "quantity", header: t("table.quantity"), align: "end", sortable: true, cell: (r) => fmt.num(r.quantity) },
        { id: "revenue", header: t("revenue"), align: "end", sortable: true, cell: (r) => money(r.revenue, c) },
        { id: "cogs", header: t("table.cogs"), align: "end", sortable: true, cell: (r) => money(r.cogs, c) },
        { id: "profit", header: t("table.profit"), align: "end", sortable: true, cell: (r) => money(r.profit, c) },
        { id: "margin_pct", header: t("table.margin"), align: "end", sortable: true, cell: (r) => fmt.pct(r.margin_pct) },
      ]}
    />
  )
}

function useCategoryColumns(nameHeader: string) {
  const t = useTranslations("reports")
  const fmt = useReportFormat()
  const money = useMoney()
  return (c: string): ReportColumn<CategoryRow>[] => [
    { id: "name", header: nameHeader, sortable: true, cell: (r) => r.name },
    { id: "quantity", header: t("table.quantity"), align: "end", sortable: true, cell: (r) => fmt.num(r.quantity) },
    { id: "revenue", header: t("revenue"), align: "end", sortable: true, cell: (r) => money(r.revenue, c) },
    { id: "profit", header: t("table.profit"), align: "end", sortable: true, cell: (r) => money(r.profit, c) },
    { id: "margin_pct", header: t("table.margin"), align: "end", sortable: true, cell: (r) => fmt.pct(r.margin_pct) },
  ]
}

function BrandsTable({ filters }: ReportPanelProps) {
  const t = useTranslations("reports")
  const list = useReportList("revenue", "desc", 10)
  const q = useReportQuery<ListReport<CategoryRow>>("brands", filters, list.params)
  const columns = useCategoryColumns(t("table.brand"))
  if (!q.data || (q.data.total === 0 && !list.search)) return null
  return (
    <ListCard
      title={t("table.topBrands")}
      list={list}
      data={q.data}
      columns={columns(q.data.currency)}
      rowKey={(r) => r.id}
      loading={q.isFetching}
    />
  )
}

export function CategoriesPanel({ filters }: ReportPanelProps) {
  const t = useTranslations("reports")
  const columns = useCategoryColumns(t("table.category"))
  return (
    <div className="space-y-6">
      <ListPanel<CategoryRow>
        section="categories"
        filters={filters}
        defaultOrderby="revenue"
        rowKey={(r) => r.id}
        columns={columns}
      />
      <BrandsTable filters={filters} />
    </div>
  )
}

export function CouponsPanel({ filters }: ReportPanelProps) {
  const t = useTranslations("reports")
  const fmt = useReportFormat()
  const money = useMoney()
  return (
    <ListPanel<CouponRow>
      section="coupons"
      filters={filters}
      defaultOrderby="count"
      rowKey={(r) => r.code}
      columns={(c) => [
        { id: "code", header: t("table.coupon"), sortable: true, cell: (r) => <span dir="ltr">{r.code}</span> },
        { id: "count", header: t("table.usage"), align: "end", sortable: true, cell: (r) => fmt.num(r.count) },
        { id: "discount", header: t("kpi.discounts"), align: "end", sortable: true, cell: (r) => money(r.discount, c) },
        { id: "revenue", header: t("revenue"), align: "end", sortable: true, cell: (r) => money(r.revenue, c) },
      ]}
    />
  )
}

export function TaxesPanel({ filters }: ReportPanelProps) {
  const t = useTranslations("reports")
  const fmt = useReportFormat()
  const money = useMoney()
  return (
    <ListPanel<TaxRow>
      section="taxes"
      filters={filters}
      defaultOrderby="total"
      rowKey={(r, i) => `${r.code}-${i}`}
      columns={(c) => [
        { id: "name", header: t("table.taxName"), sortable: true, cell: (r) => r.name || r.code },
        { id: "code", header: t("table.taxCode"), sortable: true, cell: (r) => <span dir="ltr">{r.code}</span> },
        { id: "rate", header: t("table.taxRate"), align: "end", sortable: true, cell: (r) => fmt.pct(r.rate) },
        { id: "order_tax", header: t("table.orderTax"), align: "end", sortable: true, cell: (r) => money(r.order_tax, c) },
        { id: "shipping_tax", header: t("table.shippingTax"), align: "end", sortable: true, cell: (r) => money(r.shipping_tax, c) },
        { id: "total", header: t("table.taxTotal"), align: "end", sortable: true, cell: (r) => money(r.total, c) },
        { id: "orders", header: t("orders"), align: "end", sortable: true, cell: (r) => fmt.num(r.orders) },
      ]}
    />
  )
}

export function CustomersPanel({ filters }: ReportPanelProps) {
  const t = useTranslations("reports")
  const fmt = useReportFormat()
  const money = useMoney()
  return (
    <ListPanel<CustomerRow>
      section="customers"
      filters={filters}
      defaultOrderby="revenue"
      rowKey={(r, i) => `${r.id}-${r.email}-${i}`}
      header={(data) => (
        <div className="grid gap-3 sm:grid-cols-2">
          <KpiCard label={t("kpi.newCustomers")} value={fmt.num(data.summary?.new_customers)} />
          <KpiCard label={t("kpi.returningCustomers")} value={fmt.num(data.summary?.returning_customers)} />
        </div>
      )}
      columns={(c) => [
        { id: "name", header: t("table.customer"), sortable: true, cell: (r) => r.name || "—" },
        {
          id: "email",
          header: t("table.email"),
          sortable: true,
          cell: (r) => (r.email ? <span dir="ltr">{r.email}</span> : "—"),
        },
        {
          id: "type",
          header: t("table.customerType"),
          cell: (r) => (
            <Badge variant={r.type === "new" ? "default" : "secondary"}>
              {r.type === "new" ? t("customerNew") : t("customerReturning")}
            </Badge>
          ),
        },
        { id: "orders", header: t("orders"), align: "end", sortable: true, cell: (r) => fmt.num(r.orders) },
        { id: "revenue", header: t("revenue"), align: "end", sortable: true, cell: (r) => money(r.revenue, c) },
        { id: "aov", header: t("kpi.aov"), align: "end", sortable: true, cell: (r) => money(r.aov, c) },
      ]}
    />
  )
}

export function DownloadsPanel({ filters }: ReportPanelProps) {
  const t = useTranslations("reports")
  const fmt = useReportFormat()
  return (
    <ListPanel<DownloadRow>
      section="downloads"
      filters={filters}
      defaultOrderby="downloads"
      rowKey={(r) => r.product_id}
      emptyHint={t("downloadsEmpty")}
      columns={() => [
        { id: "name", header: t("table.product"), sortable: true, cell: (r) => r.name },
        { id: "downloads", header: t("table.downloads"), align: "end", sortable: true, cell: (r) => fmt.num(r.downloads) },
      ]}
    />
  )
}
