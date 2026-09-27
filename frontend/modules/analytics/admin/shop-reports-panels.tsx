"use client"

import { useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { useQuery } from "@tanstack/react-query"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { api } from "@/lib/api"
import { formatInteger } from "@/lib/format"
import { normalizeUiLocale } from "@/lib/locale"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

function useReportFilters() {
  const [days, setDays] = useState(30)
  const [interval, setInterval] = useState("day")
  const [compare, setCompare] = useState(false)
  const [search, setSearch] = useState("")
  const [stockFilter, setStockFilter] = useState("all")
  const to = Math.floor(Date.now() / 1000)
  const from = to - days * 86400
  return { days, setDays, interval, setInterval, compare, setCompare, search, setSearch, stockFilter, setStockFilter, from, to }
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

function money(n: unknown, lng: string) {
  return formatInteger(Number(n ?? 0), lng)
}

export function ShopReportPanel({ section }: { section: string }) {
  const t = useTranslations("reports")
  const locale = useLocale()
  const lng = normalizeUiLocale(locale)
  const f = useReportFilters()

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    p.set("from", String(f.from))
    p.set("to", String(f.to))
    p.set("interval", f.interval)
    if (f.compare) p.set("compare", "1")
    if (section === "stock") {
      p.set("filter", f.stockFilter)
    } else if (["products", "variations", "categories", "coupons", "taxes", "customers", "downloads"].includes(section)) {
      if (f.search.trim()) p.set("search", f.search.trim())
    }
    return p.toString()
  }, [f.from, f.to, f.interval, f.compare, f.search, f.stockFilter, section])

  const q = useQuery({
    queryKey: ["shop-reports", section, qs],
    queryFn: () => api<Record<string, unknown>>(`/api/v1/reports/${section}?${qs}`),
  })

  const d = q.data
  const summary = (d?.summary as Record<string, unknown>) || {}
  const series = ((d?.series as Array<Record<string, unknown>>) || [])
  const items = ((d?.items as Array<Record<string, unknown>>) || [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-2">
          {[7, 30, 90].map((day) => (
            <Button key={day} size="sm" variant={f.days === day ? "default" : "outline"} onClick={() => f.setDays(day)}>
              {day}d
            </Button>
          ))}
        </div>
        {section !== "stock" ? (
          <>
            <div className="grid gap-1">
              <Label>{t("interval")}</Label>
              <Select value={f.interval} onValueChange={f.setInterval}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">{t("intervalDay")}</SelectItem>
                  <SelectItem value="week">{t("intervalWeek")}</SelectItem>
                  <SelectItem value="month">{t("intervalMonth")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={f.compare} onCheckedChange={f.setCompare} />
              <Label>{t("comparePrevious")}</Label>
            </div>
          </>
        ) : (
          <Select value={f.stockFilter} onValueChange={f.setStockFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">all</SelectItem>
              <SelectItem value="low">low</SelectItem>
              <SelectItem value="outofstock">outofstock</SelectItem>
              <SelectItem value="instock">instock</SelectItem>
            </SelectContent>
          </Select>
        )}
        {["products", "variations", "categories", "coupons", "customers"].includes(section) ? (
          <Input
            className="w-48"
            value={f.search}
            onChange={(e) => f.setSearch(e.target.value)}
          />
        ) : null}
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void (async () => {
              try {
                const res = await fetch(`/api/v1/reports/${section}/export?${qs}`, {
                  credentials: "include",
                })
                if (!res.ok) return
                const blob = await res.blob()
                const url = URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = url
                a.download = `report-${section}.csv`
                a.click()
                URL.revokeObjectURL(url)
              } catch {
                /* ignore */
              }
            })()
          }}
        >
          {t("exportCsv")}
        </Button>
      </div>

      {q.isLoading ? <p className="text-muted-foreground text-sm">{t("loading")}</p> : null}
      {q.isError ? <p className="text-destructive text-sm">{t("error")}</p> : null}

      {section !== "stock" && d ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label={t("kpi.revenue")} value={money(summary.revenue, lng)} />
          <Kpi label={t("kpi.orders")} value={money(summary.order_count, lng)} />
          <Kpi label={t("kpi.aov")} value={money(summary.avg_order_value, lng)} />
          <Kpi label={t("kpi.grossProfit")} value={money(summary.gross_profit, lng)} />
          <Kpi label={t("kpi.cogs")} value={money(summary.cogs, lng)} />
          <Kpi label={t("kpi.grossMargin")} value={`${summary.gross_margin_pct ?? 0}%`} />
          <Kpi label={t("kpi.itemsSold")} value={money(summary.items_sold, lng)} />
          <Kpi label={t("kpi.discounts")} value={money(summary.discount_total, lng)} />
        </div>
      ) : null}

      {section === "stock" && d ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label={t("stock.skuCount" as never) || "SKU"} value={money((summary as { sku_count?: number }).sku_count ?? (d as { summary: { sku_count: number } }).summary?.sku_count, lng)} />
          <Kpi label="Low stock" value={money((d.summary as { low_stock_count?: number })?.low_stock_count, lng)} />
          <Kpi label="Out of stock" value={money((d.summary as { outofstock_count?: number })?.outofstock_count, lng)} />
          <Kpi label="Units" value={money((d.summary as { units_in_stock?: number })?.units_in_stock, lng)} />
        </div>
      ) : null}

      {series.length > 0 && !["stock", "products", "variations", "categories", "coupons", "taxes", "customers", "downloads"].includes(section) ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("chart.overview")}</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : null}

      {items.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {section === "stock" ? (
                  <>
                    <TableHead>Name</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Status</TableHead>
                  </>
                ) : section === "coupons" ? (
                  <>
                    <TableHead>Code</TableHead>
                    <TableHead>Count</TableHead>
                    <TableHead>Discount</TableHead>
                    <TableHead>Revenue</TableHead>
                  </>
                ) : section === "customers" ? (
                  <>
                    <TableHead>Name</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>AOV</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>Name</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Profit</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row, i) => (
                <TableRow key={i}>
                  {section === "stock" ? (
                    <>
                      <TableCell>{String(row.name ?? "—")}</TableCell>
                      <TableCell>{String(row.sku ?? "")}</TableCell>
                      <TableCell>{money(row.stock_qty, lng)}</TableCell>
                      <TableCell>{String(row.stock_status ?? "")}</TableCell>
                    </>
                  ) : section === "coupons" ? (
                    <>
                      <TableCell>{String(row.code ?? "—")}</TableCell>
                      <TableCell>{money(row.count, lng)}</TableCell>
                      <TableCell>{money(row.discount, lng)}</TableCell>
                      <TableCell>{money(row.revenue, lng)}</TableCell>
                    </>
                  ) : section === "customers" ? (
                    <>
                      <TableCell>{String(row.name ?? "—")}</TableCell>
                      <TableCell>{money(row.orders, lng)}</TableCell>
                      <TableCell>{money(row.revenue, lng)}</TableCell>
                      <TableCell>{money(row.aov, lng)}</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell>{String(row.name ?? row.code ?? "—")}</TableCell>
                      <TableCell>{money(row.quantity, lng)}</TableCell>
                      <TableCell>{money(row.revenue, lng)}</TableCell>
                      <TableCell>{money(row.profit, lng)}</TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {!q.isLoading && !q.isError && items.length === 0 && series.length === 0 && section !== "overview" && section !== "revenue" && section !== "orders" && section !== "sales" && section !== "financial" ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : null}

      {/* top lists on overview-like sections */}
      {Array.isArray(d?.top_products) && (d.top_products as unknown[]).length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("topProducts" as never) || "Top products"}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(d.top_products as Array<Record<string, unknown>>).map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{String(row.name ?? "—")}</TableCell>
                    <TableCell>{money(row.quantity, lng)}</TableCell>
                    <TableCell>{money(row.revenue, lng)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
