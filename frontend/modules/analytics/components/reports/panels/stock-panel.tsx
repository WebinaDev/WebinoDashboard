"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Download, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api } from "@/lib/api"

import { useReportFormat } from "../format"
import { KpiCard, WfcpHint } from "../report-kpi-grid"
import type { ReportColumn } from "../report-data-table"
import type { StockReport, StockRow, StockValueBase } from "../types"
import { useReportExport, useReportList, useReportQuery } from "../use-report-filters"
import { ListCard } from "./list-panel"
import { PanelState } from "./panel-state"

const STOCK_FILTERS = ["all", "instock", "outofstock", "onbackorder", "lowstock", "missing_cost"] as const
const VALUE_BASES: StockValueBase[] = ["purchase", "retail", "current", "wholesale", "credit"]
const ALL = "__all__"

type Category = { id: number; name: string }

export function StockPanel() {
  const t = useTranslations("reports")
  const fmt = useReportFormat()
  const exporter = useReportExport()
  const [stockFilter, setStockFilter] = useState<(typeof STOCK_FILTERS)[number]>("all")
  const [category, setCategory] = useState("")
  const [valueBase, setValueBase] = useState<StockValueBase>("purchase")
  const list = useReportList("name", "asc")

  const cats = useQuery({
    queryKey: ["categories", "report-filter"],
    queryFn: async () => {
      const res = await api<Category[] | { data?: Category[] }>("/api/v1/categories?per_page=500")
      return Array.isArray(res) ? res : (res.data ?? [])
    },
    staleTime: 120_000,
  })

  const baseExtra = { stock_filter: stockFilter, category: category || undefined }
  const q = useReportQuery<StockReport>("stock", null, { ...baseExtra, ...list.params })

  const money = (v: number | null | undefined, c: string) => <MoneyDisplay amount={v ?? 0} currency={c} />

  const PLATFORM_LABELS: Record<string, string> = {
    basalam: "باسلام",
    digikala: "دیجی‌کالا",
    snappshop: "اسنپ‌شاپ",
    tapsishop: "تپسی‌شاپ",
    technolife: "تکنولایف",
    emalls: "ایمالز",
    torob: "ترب",
    zarehbin: "ذره‌بین",
    "snapppay-search": "جستجوی اسنپ‌پی",
  }

  const CORE_PRICE_KEYS = new Set([
    "purchase",
    "regular",
    "sale",
    "current",
    "retail",
    "credit",
    "wholesale",
    "installment",
  ])

  const columns = (c: string, priceKeys: string[] = []): ReportColumn<StockRow>[] => {
    const platformKeys = priceKeys.filter((k) => !CORE_PRICE_KEYS.has(k))
    const base: ReportColumn<StockRow>[] = [
    {
      id: "name",
      header: t("table.product"),
      sortable: true,
      cell: (r) => (
        <span className="inline-flex flex-wrap items-center gap-1">
          {r.name}
          {r.missing_cost ? (
            <Badge variant="outline" className="text-[10px]">
              {t("stock.missingCost")}
            </Badge>
          ) : null}
        </span>
      ),
    },
    { id: "sku", header: t("table.sku"), sortable: true, cell: (r) => (r.sku ? <span dir="ltr">{r.sku}</span> : "—") },
    {
      id: "stock_qty",
      header: t("table.stock"),
      align: "end",
      sortable: true,
      cell: (r) => (
        <span className="inline-flex items-center gap-1">
          {r.manage_stock && r.stock_qty !== null ? fmt.num(r.stock_qty) : "—"}
          {r.is_low_stock ? <Badge variant="destructive">{t("stock.low")}</Badge> : null}
        </span>
      ),
    },
    {
      id: "stock_status",
      header: t("table.stockStatus"),
      sortable: true,
      cell: (r) => fmt.enumLabel("stock_status", r.stock_status),
    },
    { id: "price_purchase", header: t("table.purchasePrice"), align: "end", sortable: true, cell: (r) => money(r.prices?.purchase, c) },
    { id: "price_retail", header: t("tier.retail"), align: "end", sortable: true, cell: (r) => money(r.prices?.retail, c) },
    { id: "price_current", header: t("table.currentPrice"), align: "end", sortable: true, cell: (r) => money(r.prices?.current, c) },
    { id: "price_wholesale", header: t("tier.wholesale"), align: "end", sortable: true, cell: (r) => money(r.prices?.wholesale, c) },
    {
      id: `value_${valueBase}`,
      header: `${t("table.stockValue")} (${t(`stock.valueBy.${valueBase}`)})`,
      align: "end",
      sortable: true,
      cell: (r) => money(r.values?.[valueBase], c),
    },
    { id: "potential_profit", header: t("table.potentialProfit"), align: "end", sortable: true, cell: (r) => money(r.potential_profit, c) },
    ]
    const platformCols: ReportColumn<StockRow>[] = platformKeys.map((slug) => ({
      id: `price_${slug}`,
      header: t("tier.marketplace", { platform: PLATFORM_LABELS[slug] ?? slug }),
      align: "end" as const,
      sortable: true,
      cell: (r: StockRow) => money(r.prices?.[slug], c),
    }))
    // Insert marketplace prices before stock value / profit columns.
    const valueIdx = base.findIndex((col) => col.id.startsWith("value_"))
    if (valueIdx === -1) return [...base, ...platformCols]
    return [...base.slice(0, valueIdx), ...platformCols, ...base.slice(valueIdx)]
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <div className="w-44 space-y-1.5">
            <Label>{t("stock.filterLabel")}</Label>
            <Select
              value={stockFilter}
              onValueChange={(v) => {
                setStockFilter(v as (typeof STOCK_FILTERS)[number])
                list.setPage(1)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STOCK_FILTERS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {t(`stockFilter.${f}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-52 space-y-1.5">
            <Label>{t("table.category")}</Label>
            <Select
              value={category || ALL}
              onValueChange={(v) => {
                setCategory(v === ALL ? "" : v)
                list.setPage(1)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("stock.categoryAll")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("stock.categoryAll")}</SelectItem>
                {(cats.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-48 space-y-1.5">
            <Label>{t("stock.valueBase")}</Label>
            <Select value={valueBase} onValueChange={(v) => setValueBase(v as StockValueBase)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VALUE_BASES.map((b) => (
                  <SelectItem key={b} value={b}>
                    {t(`stock.valueBy.${b}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ms-auto"
            disabled={exporter.busy}
            onClick={() => void exporter.run("stock", null, { ...baseExtra, search: list.search.trim() })}
          >
            {exporter.busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {t("exportCsv")}
          </Button>
        </CardContent>
      </Card>

      <PanelState q={q}>
        {(data) => {
          const s = data.summary
          const c = data.currency
          return (
            <>
              <WfcpHint enabled={Boolean(s.wfcp_enabled)} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <KpiCard label={t("stock.skuCount")} value={fmt.num(s.sku_count)} />
                <KpiCard label={t("stock.units")} value={fmt.num(s.units_in_stock)} />
                <KpiCard label={t("stock.outofstock")} value={fmt.num(s.outofstock_count)} />
                <KpiCard
                  label={t("stock.low")}
                  value={fmt.num(s.low_stock_count)}
                  extra={
                    s.low_stock_threshold ? (
                      <span className="text-muted-foreground text-xs">
                        {t("stock.threshold", { n: fmt.num(s.low_stock_threshold) })}
                      </span>
                    ) : null
                  }
                />
                <KpiCard label={t("stock.missingCost")} value={fmt.num(s.missing_cost_count)} />
                <KpiCard label={t("stock.valuePurchase")} value={money(s.value_purchase, c)} />
                <KpiCard label={t("stock.valueRetail")} value={money(s.value_retail, c)} />
                <KpiCard label={t("stock.valueWholesale")} value={money(s.value_wholesale, c)} />
                <KpiCard label={t("stock.potentialProfit")} value={money(s.potential_profit, c)} />
              </div>
              <ListCard
                list={list}
                data={data}
                columns={columns(c, data.price_keys ?? [])}
                rowKey={(r) => r.id}
                loading={q.isFetching}
              />
            </>
          )
        }}
      </PanelState>
    </div>
  )
}
