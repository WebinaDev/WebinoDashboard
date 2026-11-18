"use client"

import { useCallback, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { statusBadgeVariant } from "@/lib/enum-labels"
import { formatDateTime } from "@/lib/locale/format-date"

import { BasalamBalanceCard } from "../basalam-balance-card"
import { useReportFormat } from "../format"
import { HBarChart, PriceTierChart, ProfitChart, StatusPie } from "../report-charts"
import { ReportDataTable, useLocalTable, type ReportColumn } from "../report-data-table"
import { ReportKpiGrid } from "../report-kpi-grid"
import type { FinancialOrderRow, FinancialReport, PaymentRow, UtmComboRow, UtmDimRow } from "../types"
import { useReportList, useReportQuery } from "../use-report-filters"
import { PanelState, type ReportPanelProps } from "./panel-state"

type Tab = "summary" | "gateways" | "utm" | "orders"
type UtmSub = "source" | "medium" | "campaign" | "combo"

const ALL = "__all__"
/** Backend alias for the empty ("direct / none") UTM value. */
const UTM_NONE = "__none__"

const toParam = (v: string | null) => (v === null ? undefined : v === "" ? UTM_NONE : v)

export function FinancialPanel({ filters }: ReportPanelProps) {
  const t = useTranslations("reports")
  const fmt = useReportFormat()

  const [tab, setTab] = useState<Tab>("summary")
  const [utmSub, setUtmSub] = useState<UtmSub>("source")
  // null = no filter; "" = direct / none.
  const [payment, setPayment] = useState<string | null>(null)
  const [utmSource, setUtmSource] = useState<string | null>(null)
  const [utmMedium, setUtmMedium] = useState<string | null>(null)
  const [utmCampaign, setUtmCampaign] = useState<string | null>(null)
  const orders = useReportList("created_at")

  const drillPay = tab === "gateways" || tab === "orders" ? payment : null
  const drillUtm = tab === "utm" || tab === "orders"
  const q = useReportQuery<FinancialReport>("financial", filters, {
    payment_method: drillPay ?? undefined,
    utm_source: drillUtm ? toParam(utmSource) : undefined,
    utm_medium: drillUtm ? toParam(utmMedium) : undefined,
    utm_campaign: drillUtm ? toParam(utmCampaign) : undefined,
    search: orders.params.search,
    page: orders.page,
    per_page: orders.perPage,
  })

  const resetPage = () => orders.setPage(1)
  const clearDrill = () => {
    setPayment(null)
    setUtmSource(null)
    setUtmMedium(null)
    setUtmCampaign(null)
    orders.setSearch("")
  }

  const currency = q.data?.currency
  const money = useCallback((v: number) => <MoneyDisplay amount={v} currency={currency} />, [currency])

  const orderColumns: ReportColumn<FinancialOrderRow>[] = [
    {
      id: "number",
      header: t("table.orderNumber"),
      cell: (r) => (
        <Link href={`/dashboard/orders/${r.id}`} className="text-primary font-medium underline-offset-2 hover:underline">
          #{fmt.digits(r.number || r.id)}
        </Link>
      ),
    },
    { id: "created_at", header: t("table.date"), cell: (r) => (r.created_at ? formatDateTime(r.created_at, fmt.locale as "fa" | "en") : "—") },
    { id: "customer_name", header: t("table.customer"), cell: (r) => r.customer_name || "—" },
    {
      id: "status",
      header: t("table.status"),
      cell: (r) => <Badge variant={statusBadgeVariant(r.status)}>{fmt.enumLabel("order_status", r.status)}</Badge>,
    },
    { id: "payment", header: t("table.payment"), cell: (r) => r.payment_title || r.payment_method || "—" },
    { id: "utm_source", header: t("table.utmSource"), cell: (r) => fmt.utmLabel(r.utm_source) },
    { id: "total", header: t("table.total"), align: "end", cell: (r) => money(r.total) },
  ]

  const renderOrders = (data: FinancialReport, withSearch = false) => (
    <ReportDataTable
      rows={data.orders_filtered?.items ?? []}
      columns={orderColumns}
      rowKey={(r) => r.id}
      total={data.orders_filtered?.total ?? 0}
      page={data.orders_filtered?.page ?? orders.page}
      perPage={data.orders_filtered?.per_page ?? orders.perPage}
      onPageChange={orders.setPage}
      onPerPageChange={orders.setPerPage}
      search={withSearch ? orders.search : undefined}
      onSearchChange={withSearch ? orders.setSearch : undefined}
      loading={q.isFetching}
    />
  )

  return (
    <div className="space-y-6">
      <BasalamBalanceCard />
      <PanelState q={q}>
        {(data) => (
          <Tabs
            value={tab}
            onValueChange={(v) => {
              setTab(v as Tab)
              resetPage()
            }}
            className="space-y-4"
          >
            <TabsList className="max-w-full justify-start overflow-x-auto">
              <TabsTrigger value="summary">{t("financial.tabs.summary")}</TabsTrigger>
              <TabsTrigger value="gateways">{t("financial.tabs.gateways")}</TabsTrigger>
              <TabsTrigger value="utm">{t("financial.tabs.utm")}</TabsTrigger>
              <TabsTrigger value="orders">{t("financial.tabs.orders")}</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="space-y-4">
              <ReportKpiGrid summary={data.summary} compareSummary={data.compare?.summary} currency={data.currency} />
              <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                <ProfitChart series={data.series} compareSeries={data.compare?.series} currency={data.currency} />
                <PriceTierChart rows={data.by_price_tier ?? []} currency={data.currency} />
              </div>
              <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                <HBarChart
                  title={t("financial.chart.paymentProfit")}
                  rows={(data.by_payment ?? []).map((r) => ({ name: r.title || r.method, value: r.revenue, value2: r.profit }))}
                  valueLabel={t("revenue")}
                  value2Label={t("table.profit")}
                  money
                  currency={data.currency}
                />
                <HBarChart
                  title={t("financial.chart.byUtm")}
                  rows={(data.by_utm_source ?? []).map((r) => ({ name: fmt.utmLabel(r.value), value: r.revenue, value2: r.profit }))}
                  valueLabel={t("revenue")}
                  value2Label={t("table.profit")}
                  money
                  currency={data.currency}
                />
                <StatusPie rows={data.by_status ?? []} currency={data.currency} />
                <HBarChart
                  title={t("chart.bySource")}
                  rows={(data.by_source ?? []).map((r) => ({ name: fmt.sourceLabel(r.source), value: r.revenue }))}
                  valueLabel={t("revenue")}
                  money
                  currency={data.currency}
                />
              </div>
            </TabsContent>

            <TabsContent value="gateways" className="space-y-4">
              <GatewaysTab
                data={data}
                money={money}
                selected={payment}
                onSelect={(m) => {
                  setPayment((p) => (p === m ? null : m))
                  resetPage()
                }}
                orders={renderOrders(data)}
              />
            </TabsContent>

            <TabsContent value="utm" className="space-y-4">
              <UtmTab
                data={data}
                money={money}
                sub={utmSub}
                onSubChange={(s) => {
                  setUtmSub(s)
                  setUtmSource(null)
                  setUtmMedium(null)
                  setUtmCampaign(null)
                  resetPage()
                }}
                selected={utmSub === "medium" ? utmMedium : utmSub === "campaign" ? utmCampaign : utmSource}
                onSelect={(v) => {
                  const toggle = (p: string | null) => (p === v ? null : v)
                  if (utmSub === "medium") setUtmMedium(toggle)
                  else if (utmSub === "campaign") setUtmCampaign(toggle)
                  else setUtmSource(toggle)
                  resetPage()
                }}
                orders={renderOrders(data)}
              />
            </TabsContent>

            <TabsContent value="orders" className="space-y-4">
              <Card className="shadow-sm">
                <CardContent className="flex flex-wrap items-end gap-3 pt-4">
                  <DrillSelect
                    label={t("financial.filterPayment")}
                    allLabel={t("financial.allPayments")}
                    value={payment}
                    options={(data.by_payment ?? []).map((r) => ({ value: r.method, label: r.title || r.method }))}
                    onChange={(v) => {
                      setPayment(v)
                      resetPage()
                    }}
                  />
                  <DrillSelect
                    label={t("financial.filterUtmSource")}
                    allLabel={t("financial.allUtm")}
                    value={utmSource}
                    options={(data.by_utm_source ?? []).map((r) => ({ value: r.value, label: fmt.utmLabel(r.value) }))}
                    onChange={(v) => {
                      setUtmSource(v)
                      resetPage()
                    }}
                  />
                  <DrillSelect
                    label={t("financial.filterUtmMedium")}
                    allLabel={t("financial.allUtm")}
                    value={utmMedium}
                    options={(data.by_utm_medium ?? []).map((r) => ({ value: r.value, label: fmt.utmLabel(r.value) }))}
                    onChange={(v) => {
                      setUtmMedium(v)
                      resetPage()
                    }}
                  />
                  <DrillSelect
                    label={t("financial.filterUtmCampaign")}
                    allLabel={t("financial.allUtm")}
                    value={utmCampaign}
                    options={(data.by_utm_campaign ?? []).map((r) => ({ value: r.value, label: fmt.utmLabel(r.value) }))}
                    onChange={(v) => {
                      setUtmCampaign(v)
                      resetPage()
                    }}
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={clearDrill}>
                    {t("financial.clearFilters")}
                  </Button>
                </CardContent>
              </Card>
              <Card className="shadow-sm">
                <CardContent className="pt-6">
                  {renderOrders(data, true)}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </PanelState>
    </div>
  )
}

/** Select whose "" option means direct/none; ALL clears the filter (null). */
function DrillSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string
  allLabel: string
  value: string | null
  options: { value: string; label: string }[]
  onChange: (v: string | null) => void
}) {
  const enc = (v: string) => (v === "" ? UTM_NONE : v)
  return (
    <div className="w-48 space-y-1.5">
      <Label>{label}</Label>
      <Select
        value={value === null ? ALL : enc(value)}
        onValueChange={(v) => onChange(v === ALL ? null : v === UTM_NONE ? "" : v)}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={enc(o.value)} value={enc(o.value)}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function DrillChips<T>({
  rows,
  value,
  label,
  count,
  selected,
  onSelect,
}: {
  rows: T[]
  value: (r: T) => string
  label: (r: T) => string
  count: (r: T) => number
  selected: string | null
  onSelect: (v: string) => void
}) {
  const fmt = useReportFormat()
  return (
    <div className="flex flex-wrap gap-2">
      {rows.map((r) => {
        const v = value(r)
        return (
          <Button
            key={v || UTM_NONE}
            type="button"
            size="sm"
            variant={selected === v ? "default" : "outline"}
            onClick={() => onSelect(v)}
          >
            {label(r)}
            <span className="opacity-70">({fmt.num(count(r))})</span>
          </Button>
        )
      })}
    </div>
  )
}

function GatewaysTab({
  data,
  money,
  selected,
  onSelect,
  orders,
}: {
  data: FinancialReport
  money: (v: number) => ReactNode
  selected: string | null
  onSelect: (method: string) => void
  orders: ReactNode
}) {
  const t = useTranslations("reports")
  const fmt = useReportFormat()
  const rows = useMemo(() => data.by_payment ?? [], [data.by_payment])
  const local = useLocalTable<PaymentRow>(rows, (r) => `${r.title} ${r.method}`, "revenue")
  const selectedTitle = rows.find((r) => r.method === selected)?.title || selected

  const columns: ReportColumn<PaymentRow>[] = [
    { id: "title", header: t("table.gateway"), sortable: true, cell: (r) => r.title || r.method },
    { id: "count", header: t("orders"), align: "end", sortable: true, cell: (r) => fmt.num(r.count) },
    { id: "revenue", header: t("revenue"), align: "end", sortable: true, cell: (r) => money(r.revenue) },
    { id: "cogs", header: t("table.cogs"), align: "end", sortable: true, cell: (r) => money(r.cogs) },
    { id: "profit", header: t("table.profit"), align: "end", sortable: true, cell: (r) => money(r.profit) },
    { id: "margin_pct", header: t("table.margin"), align: "end", sortable: true, cell: (r) => fmt.pct(r.margin_pct) },
    { id: "avg_order_value", header: t("table.aov"), align: "end", sortable: true, cell: (r) => money(r.avg_order_value) },
  ]

  return (
    <>
      <HBarChart
        title={t("financial.chart.paymentProfit")}
        rows={rows.map((r) => ({ name: r.title || r.method, value: r.revenue, value2: r.profit }))}
        valueLabel={t("revenue")}
        value2Label={t("table.profit")}
        money
        currency={data.currency}
      />
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">{t("chart.byPayment")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <ReportDataTable columns={columns} rowKey={(r) => r.method} {...local} />
          <DrillChips
            rows={rows}
            value={(r) => r.method}
            label={(r) => r.title || r.method}
            count={(r) => r.count}
            selected={selected}
            onSelect={onSelect}
          />
          {selected !== null ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("financial.ordersFor", { label: selectedTitle ?? "" })}</p>
              {orders}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t("financial.selectGateway")}</p>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function UtmTab({
  data,
  money,
  sub,
  onSubChange,
  selected,
  onSelect,
  orders,
}: {
  data: FinancialReport
  money: (v: number) => ReactNode
  sub: UtmSub
  onSubChange: (s: UtmSub) => void
  selected: string | null
  onSelect: (v: string) => void
  orders: ReactNode
}) {
  const t = useTranslations("reports")
  const fmt = useReportFormat()

  const dimRows = useMemo(
    () => (sub === "medium" ? data.by_utm_medium : sub === "campaign" ? data.by_utm_campaign : data.by_utm_source) ?? [],
    [sub, data.by_utm_medium, data.by_utm_campaign, data.by_utm_source],
  )
  const comboRows = useMemo(() => data.by_utm ?? [], [data.by_utm])
  const dimTable = useLocalTable<UtmDimRow>(dimRows, (r) => `${r.value} ${fmt.utmLabel(r.value)}`, "revenue")
  const comboTable = useLocalTable<UtmComboRow>(
    comboRows,
    (r) => `${r.utm_source} ${r.utm_medium} ${r.utm_campaign}`,
    "revenue",
  )

  const dimHeader =
    sub === "medium" ? t("table.utmMedium") : sub === "campaign" ? t("table.utmCampaign") : t("table.utmSource")

  const dimColumns: ReportColumn<UtmDimRow>[] = [
    { id: "value", header: dimHeader, sortable: true, cell: (r) => fmt.utmLabel(r.value) },
    { id: "count", header: t("orders"), align: "end", sortable: true, cell: (r) => fmt.num(r.count) },
    { id: "revenue", header: t("revenue"), align: "end", sortable: true, cell: (r) => money(r.revenue) },
    { id: "profit", header: t("table.profit"), align: "end", sortable: true, cell: (r) => money(r.profit) },
    { id: "margin_pct", header: t("table.margin"), align: "end", sortable: true, cell: (r) => fmt.pct(r.margin_pct) },
    { id: "avg_order_value", header: t("table.aov"), align: "end", sortable: true, cell: (r) => money(r.avg_order_value) },
  ]
  const comboColumns: ReportColumn<UtmComboRow>[] = [
    { id: "utm_source", header: t("table.utmSource"), sortable: true, cell: (r) => fmt.utmLabel(r.utm_source) },
    { id: "utm_medium", header: t("table.utmMedium"), sortable: true, cell: (r) => fmt.utmLabel(r.utm_medium) },
    { id: "utm_campaign", header: t("table.utmCampaign"), sortable: true, cell: (r) => fmt.utmLabel(r.utm_campaign) },
    { id: "count", header: t("orders"), align: "end", sortable: true, cell: (r) => fmt.num(r.count) },
    { id: "revenue", header: t("revenue"), align: "end", sortable: true, cell: (r) => money(r.revenue) },
    { id: "profit", header: t("table.profit"), align: "end", sortable: true, cell: (r) => money(r.profit) },
    { id: "margin_pct", header: t("table.margin"), align: "end", sortable: true, cell: (r) => fmt.pct(r.margin_pct) },
  ]

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {(["source", "medium", "campaign", "combo"] as const).map((k) => (
          <Button key={k} type="button" size="sm" variant={sub === k ? "default" : "outline"} onClick={() => onSubChange(k)}>
            {t(`financial.utmSub.${k}`)}
          </Button>
        ))}
      </div>
      {sub !== "combo" ? (
        <HBarChart
          title={dimHeader}
          rows={dimRows.map((r) => ({ name: fmt.utmLabel(r.value), value: r.revenue, value2: r.profit }))}
          valueLabel={t("revenue")}
          value2Label={t("table.profit")}
          money
          currency={data.currency}
        />
      ) : null}
      <Card className="shadow-sm">
        <CardContent className="space-y-4 pt-6">
          {sub === "combo" ? (
            <ReportDataTable
              columns={comboColumns}
              rowKey={(r) => `${r.utm_source}|${r.utm_medium}|${r.utm_campaign}`}
              {...comboTable}
            />
          ) : (
            <>
              <ReportDataTable columns={dimColumns} rowKey={(r) => r.value || UTM_NONE} {...dimTable} />
              <DrillChips
                rows={dimRows.slice(0, 20)}
                value={(r) => r.value}
                label={(r) => fmt.utmLabel(r.value)}
                count={(r) => r.count}
                selected={selected}
                onSelect={onSelect}
              />
              {selected !== null ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t("financial.ordersFor", { label: fmt.utmLabel(selected) })}</p>
                  {orders}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">{t("financial.selectUtm")}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}
