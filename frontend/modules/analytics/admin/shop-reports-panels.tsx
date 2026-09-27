"use client"

import { useMemo, useState, type ReactNode } from "react"
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

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { QueryErrorState } from "@/components/QueryErrorState"
import { TableListSkeleton } from "@/components/TableListSkeleton"
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

function Kpi({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card variant="stat" className="wd-mini-tint">
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

function count(n: unknown, lng: string) {
  return formatInteger(Number(n ?? 0), lng)
}

function Money({ value }: { value: unknown }) {
  return <MoneyDisplay amount={Number(value ?? 0)} />
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
  const nameHead = section === "customers" ? t("table.customer") : t("table.product")

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-2">
          {[7, 30, 90].map((day) => (
            <Button key={day} size="sm" variant={f.days === day ? "default" : "outline"} onClick={() => f.setDays(day)}>
              {t("daysN", { n: formatInteger(day, lng) })}
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
              <SelectItem value="all">{t("stockFilter.all")}</SelectItem>
              <SelectItem value="low">{t("stockFilter.lowstock")}</SelectItem>
              <SelectItem value="outofstock">{t("stockFilter.outofstock")}</SelectItem>
              <SelectItem value="instock">{t("stockFilter.instock")}</SelectItem>
            </SelectContent>
          </Select>
        )}
        {["products", "variations", "categories", "coupons", "customers"].includes(section) ? (
          <Input
            className="w-48"
            value={f.search}
            placeholder={t("searchPlaceholder")}
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

      {q.isLoading ? <TableListSkeleton rows={4} columns={4} /> : null}
      {q.isError ? <QueryErrorState message={t("error")} onRetry={() => q.refetch()} /> : null}

      {section !== "stock" && d ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label={t("kpi.revenue")} value={<Money value={summary.revenue} />} />
          <Kpi label={t("kpi.orders")} value={count(summary.order_count, lng)} />
          <Kpi label={t("kpi.aov")} value={<Money value={summary.avg_order_value} />} />
          <Kpi label={t("kpi.grossProfit")} value={<Money value={summary.gross_profit} />} />
          <Kpi label={t("kpi.cogs")} value={<Money value={summary.cogs} />} />
          <Kpi label={t("kpi.grossMargin")} value={`${summary.gross_margin_pct ?? 0}%`} />
          <Kpi label={t("kpi.itemsSold")} value={count(summary.items_sold, lng)} />
          <Kpi label={t("kpi.discounts")} value={<Money value={summary.discount_total} />} />
        </div>
      ) : null}

      {section === "stock" && d ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label={t("stock.skuCount")} value={count((summary as { sku_count?: number }).sku_count ?? (d as { summary: { sku_count: number } }).summary?.sku_count, lng)} />
          <Kpi label={t("stock.low")} value={count((d.summary as { low_stock_count?: number })?.low_stock_count, lng)} />
          <Kpi label={t("stock.outofstock")} value={count((d.summary as { outofstock_count?: number })?.outofstock_count, lng)} />
          <Kpi label={t("stock.units")} value={count((d.summary as { units_in_stock?: number })?.units_in_stock, lng)} />
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
                    <TableHead>{nameHead}</TableHead>
                    <TableHead>{t("table.sku")}</TableHead>
                    <TableHead>{t("table.quantity")}</TableHead>
                    <TableHead>{t("table.status")}</TableHead>
                  </>
                ) : section === "coupons" ? (
                  <>
                    <TableHead>{t("table.coupon")}</TableHead>
                    <TableHead>{t("table.usage")}</TableHead>
                    <TableHead>{t("kpi.discounts")}</TableHead>
                    <TableHead>{t("revenue")}</TableHead>
                  </>
                ) : section === "customers" ? (
                  <>
                    <TableHead>{nameHead}</TableHead>
                    <TableHead>{t("orders")}</TableHead>
                    <TableHead>{t("revenue")}</TableHead>
                    <TableHead>{t("table.aov")}</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>{nameHead}</TableHead>
                    <TableHead>{t("table.quantity")}</TableHead>
                    <TableHead>{t("revenue")}</TableHead>
                    <TableHead>{t("table.profit")}</TableHead>
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
                      <TableCell>{count(row.stock_qty, lng)}</TableCell>
                      <TableCell>
                        {row.stock_status && t.has(`stockStatus.${String(row.stock_status)}`)
                          ? t(`stockStatus.${String(row.stock_status)}`)
                          : String(row.stock_status ?? "")}
                      </TableCell>
                    </>
                  ) : section === "coupons" ? (
                    <>
                      <TableCell>{String(row.code ?? "—")}</TableCell>
                      <TableCell>{count(row.count, lng)}</TableCell>
                      <TableCell><Money value={row.discount} /></TableCell>
                      <TableCell><Money value={row.revenue} /></TableCell>
                    </>
                  ) : section === "customers" ? (
                    <>
                      <TableCell>{String(row.name ?? "—")}</TableCell>
                      <TableCell>{count(row.orders, lng)}</TableCell>
                      <TableCell><Money value={row.revenue} /></TableCell>
                      <TableCell><Money value={row.aov} /></TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell>{String(row.name ?? row.code ?? "—")}</TableCell>
                      <TableCell>{count(row.quantity, lng)}</TableCell>
                      <TableCell><Money value={row.revenue} /></TableCell>
                      <TableCell><Money value={row.profit} /></TableCell>
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
            <CardTitle className="text-base">{t("table.topProducts")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{nameHead}</TableHead>
                  <TableHead>{t("table.quantity")}</TableHead>
                  <TableHead>{t("revenue")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(d.top_products as Array<Record<string, unknown>>).map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{String(row.name ?? "—")}</TableCell>
                    <TableCell>{count(row.quantity, lng)}</TableCell>
                    <TableCell><Money value={row.revenue} /></TableCell>
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
