"use client"

import { useQuery } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { useState, type ReactNode } from "react"

import { MoneyText } from "@/components/currency/MoneyDisplay"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { toLocaleDigits } from "@/lib/locale"

import { CafeAdminShell, CafeEmptyState, CafeSection, cafeSelectClass } from "./cafe-admin-ui"

type PL = {
  revenue: { orders: number; gross_minor: number; delivery_minor: number; net_minor: number; discounts_minor: number; tax_minor: number }
  cost_of_sales: { material_minor: number; incomplete_lines: number; complete: boolean }
  gross_profit_minor: number
  gross_margin_percent: number | null
  payroll_minor: number
  prime_cost_minor: number
  prime_cost_percent: number | null
  expenses: { code: string; name: string; amount_minor: number }[]
  expenses_minor: number
  operating_profit_minor: number
  operating_margin_percent: number | null
  average_ticket_minor: number
}

type MenuRow = {
  product_id: number
  name: string
  quantity: number
  revenue_minor: number
  cost_minor: number
  margin_per_unit_minor: number
  margin_percent: number | null
  class: "star" | "plough_horse" | "puzzle" | "dog"
}

type ControlRow = {
  user_id: number
  name: string
  orders: number
  sales_minor: number
  discounts_minor: number
  discount_percent: number | null
  cancelled_orders: number
  short_minor: number
  over_minor: number
  net_variance_minor: number
}

type Aging = {
  as_of: string
  buckets: { current: number; days_30: number; days_60: number; days_90: number }
  total_minor: number
  customers: { person_id: number; name: string; total_minor: number; oldest_days: number }[]
}

type Kpis = {
  from: string
  to: string
  days: number
  orders: number
  revenue_minor: number
  average_ticket_minor: number
  service: { order_to_serve_minutes: number | null; slowest_line_minutes: number | null; lines_measured: number }
  tables: {
    table_dwell_minutes: number | null
    sittings: number
    active_tables: number
    table_turnover: number | null
    occupancy_percent: number | null
    service_day_minutes: number
  }
  break_even: {
    revenue_minor: number | null
    fixed_cost_minor: number
    contribution_percent: number | null
    complete: boolean
  }
}

type ReportKind = "profit-loss" | "menu-engineering" | "control" | "ar-aging" | "service-kpis"

// Service KPIs come first in the list: "how fast and how full" is the question asked every
// morning, and the money reports answer the question asked at month end.
const TABS: ReportKind[] = ["service-kpis", "profit-loss", "menu-engineering", "control", "ar-aging"]

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export default function ReportsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.reports")
  const locale = useLocale()

  const [tab, setTab] = useState<ReportKind>("profit-loss")
  const [from, setFrom] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return isoDate(d)
  })
  const [to, setTo] = useState(() => isoDate(new Date()))
  const [branchId, setBranchId] = useState("")

  const query = new URLSearchParams({ from, to })
  if (branchId.trim() !== "") query.set("branch_id", branchId.trim())
  const qs = query.toString()

  const pl = useQuery({
    queryKey: ["cafe-report-pl", qs],
    enabled: tab === "profit-loss",
    queryFn: async () => (await api<{ data: PL }>(`/api/v1/reports/profit-loss?${qs}`))?.data ?? null,
    retry: false,
  })

  const menu = useQuery({
    queryKey: ["cafe-report-menu", qs],
    enabled: tab === "menu-engineering",
    queryFn: async () =>
      (await api<{ data: { items: MenuRow[] } }>(`/api/v1/reports/menu-engineering?${qs}`))?.data ?? null,
    retry: false,
  })

  const control = useQuery({
    queryKey: ["cafe-report-control", qs],
    enabled: tab === "control",
    queryFn: async () =>
      (await api<{ data: { staff: ControlRow[] } }>(`/api/v1/reports/control?${qs}`))?.data ?? null,
    retry: false,
  })

  const kpis = useQuery({
    queryKey: ["cafe-report-kpis", qs],
    enabled: tab === "service-kpis",
    queryFn: async () => (await api<{ data: Kpis }>(`/api/v1/reports/service-kpis?${qs}`))?.data ?? null,
    retry: false,
  })

  const aging = useQuery({
    queryKey: ["cafe-report-aging", to],
    enabled: tab === "ar-aging",
    queryFn: async () => (await api<{ data: Aging }>(`/api/v1/reports/ar-aging?as_of=${to}`))?.data ?? null,
    retry: false,
  })

  /**
   * Download the current report as CSV.
   *
   * A plain link would drop the auth header, so the file is fetched and handed to the browser
   * as a blob — the same bytes the server built, with the BOM Excel needs.
   */
  const download = async () => {
    const params = new URLSearchParams(tab === "ar-aging" ? { as_of: to } : { from, to })
    if (branchId.trim() !== "" && tab !== "ar-aging") params.set("branch_id", branchId.trim())
    params.set("format", "csv")

    // Same base the JSON client uses: the API may live on another origin in production.
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    const res = await fetch(`${base}/api/v1/reports/${tab}?${params.toString()}`, {
      credentials: "include",
      headers: {
        Accept: "text/csv",
        "X-Requested-With": "XMLHttpRequest",
        ...(document.documentElement.lang ? { "X-Locale": document.documentElement.lang } : {}),
      },
    })
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${tab}-${from}-${to}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  // A null KPI is shown as an em dash, never as zero: "0 minutes to serve" and "we could not
  // measure" are very different statements and only one of them is true here.
  const minutes = (value: number | null | undefined) =>
    value === null || value === undefined ? "—" : `${toLocaleDigits(String(value), locale)} ${t("minutes")}`

  const percent = (value: number | null | undefined) =>
    value === null || value === undefined ? "—" : `${toLocaleDigits(String(value), locale)}٪`

  const classLabel: Record<MenuRow["class"], string> = {
    star: t("class_star"),
    plough_horse: t("class_plough_horse"),
    puzzle: t("class_puzzle"),
    dog: t("class_dog"),
  }

  return (
    <CafeAdminShell title={t("title")} description={t("description")}>
      <CafeSection
        title={t("filters")}
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="report-from">{t("from")}</Label>
              <Input id="report-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="report-to">{t("to")}</Label>
              <Input id="report-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="report-branch">{t("branch")}</Label>
              <Input
                id="report-branch"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                placeholder={t("all_branches")}
                className="w-32"
                inputMode="numeric"
              />
            </div>
            <Button variant="outline" onClick={() => void download()}>
              {t("export_csv")}
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap gap-2">
          {TABS.map((kind) => (
            <Button
              key={kind}
              size="sm"
              variant={tab === kind ? "default" : "outline"}
              onClick={() => setTab(kind)}
            >
              {t(`tab_${kind.replace("-", "_")}`)}
            </Button>
          ))}
        </div>
      </CafeSection>

      {tab === "service-kpis" ? (
        !kpis.data ? (
          <CafeEmptyState message={t("unavailable")} />
        ) : (
          <>
            <CafeSection title={t("kpi_service_title")} description={t("kpi_service_hint")}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label={t("kpi_order_to_serve")} value={minutes(kpis.data.service.order_to_serve_minutes)} />
                <Stat label={t("kpi_slowest_line")} value={minutes(kpis.data.service.slowest_line_minutes)} />
                <Stat
                  label={t("kpi_lines_measured")}
                  value={toLocaleDigits(String(kpis.data.service.lines_measured), locale)}
                />
                <Stat label={t("kpi_average_ticket")} value={<MoneyText amount={kpis.data.average_ticket_minor} />} />
              </div>
            </CafeSection>

            <CafeSection title={t("kpi_tables_title")} description={t("kpi_tables_hint")}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label={t("kpi_dwell")} value={minutes(kpis.data.tables.table_dwell_minutes)} />
                <Stat
                  label={t("kpi_turnover")}
                  value={
                    kpis.data.tables.table_turnover === null
                      ? "—"
                      : toLocaleDigits(String(kpis.data.tables.table_turnover), locale)
                  }
                />
                <Stat label={t("kpi_occupancy")} value={percent(kpis.data.tables.occupancy_percent)} />
                <Stat
                  label={t("kpi_sittings")}
                  value={`${toLocaleDigits(String(kpis.data.tables.sittings), locale)} / ${toLocaleDigits(
                    String(kpis.data.tables.active_tables),
                    locale,
                  )}`}
                />
              </div>

              {/* Occupancy has a denominator; when it is missing say so rather than show 0%. */}
              {kpis.data.tables.service_day_minutes <= 0 ? (
                <p className="text-destructive text-xs" role="alert">
                  {t("kpi_no_service_day")}
                </p>
              ) : null}
            </CafeSection>

            <CafeSection title={t("kpi_break_even_title")} description={t("kpi_break_even_hint")}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat
                  label={t("kpi_break_even")}
                  value={
                    kpis.data.break_even.revenue_minor === null ? (
                      "—"
                    ) : (
                      <MoneyText amount={kpis.data.break_even.revenue_minor} />
                    )
                  }
                />
                <Stat label={t("kpi_fixed_cost")} value={<MoneyText amount={kpis.data.break_even.fixed_cost_minor} />} />
                <Stat label={t("kpi_contribution")} value={percent(kpis.data.break_even.contribution_percent)} />
                <Stat label={t("kpi_orders")} value={toLocaleDigits(String(kpis.data.orders), locale)} />
              </div>

              {!kpis.data.break_even.complete ? (
                <p className="text-destructive text-xs" role="alert">
                  {t("kpi_break_even_incomplete")}
                </p>
              ) : null}
            </CafeSection>
          </>
        )
      ) : null}

      {tab === "profit-loss" ? (
        pl.isLoading ? (
          <p className="text-muted-foreground text-sm">{t("loading")}</p>
        ) : !pl.data ? (
          <CafeEmptyState message={t("unavailable")} />
        ) : (
          <>
            <CafeSection title={t("pl_title")}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label={t("net_revenue")} value={<MoneyText amount={pl.data.revenue.net_minor} />} />
                <Stat label={t("material_cost")} value={<MoneyText amount={pl.data.cost_of_sales.material_minor} />} />
                <Stat label={t("gross_profit")} value={<MoneyText amount={pl.data.gross_profit_minor} />} />
                <Stat label={t("gross_margin")} value={percent(pl.data.gross_margin_percent)} />
                <Stat label={t("prime_cost")} value={<MoneyText amount={pl.data.prime_cost_minor} />} />
                <Stat label={t("prime_cost_percent")} value={percent(pl.data.prime_cost_percent)} />
                <Stat label={t("expenses")} value={<MoneyText amount={pl.data.expenses_minor} />} />
                <Stat label={t("operating_profit")} value={<MoneyText amount={pl.data.operating_profit_minor} />} />
              </div>

              {/* The caveat that matters more than any number above it. */}
              {!pl.data.cost_of_sales.complete ? (
                <p className="text-destructive text-xs" role="alert">
                  {t("incomplete_costs", { count: toLocaleDigits(String(pl.data.cost_of_sales.incomplete_lines), locale) })}
                </p>
              ) : null}

              {(pl.data.expenses?.length ?? 0) > 0 ? (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("expense_account")}</TableHead>
                        <TableHead>{t("amount")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pl.data.expenses.map((row) => (
                        <TableRow key={row.code}>
                          <TableCell>
                            {row.name} <span className="text-muted-foreground text-xs">{row.code}</span>
                          </TableCell>
                          <TableCell>
                            <MoneyText amount={row.amount_minor} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </CafeSection>
          </>
        )
      ) : null}

      {tab === "menu-engineering" ? (
        (menu.data?.items?.length ?? 0) === 0 ? (
          <CafeEmptyState message={t("no_sales")} />
        ) : (
          <CafeSection title={t("menu_title")} description={t("menu_hint")}>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("item")}</TableHead>
                    <TableHead>{t("quantity")}</TableHead>
                    <TableHead>{t("revenue")}</TableHead>
                    <TableHead>{t("cost")}</TableHead>
                    <TableHead>{t("margin_per_unit")}</TableHead>
                    <TableHead>{t("class")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {menu.data!.items.map((row) => (
                    <TableRow key={row.product_id}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="tabular-nums">{toLocaleDigits(String(row.quantity), locale)}</TableCell>
                      <TableCell>
                        <MoneyText amount={row.revenue_minor} />
                      </TableCell>
                      <TableCell>
                        <MoneyText amount={row.cost_minor} />
                      </TableCell>
                      <TableCell>
                        <MoneyText amount={row.margin_per_unit_minor} />
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.class === "star" ? "default" : row.class === "dog" ? "destructive" : "secondary"
                          }
                        >
                          {classLabel[row.class]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CafeSection>
        )
      ) : null}

      {tab === "control" ? (
        (control.data?.staff?.length ?? 0) === 0 ? (
          <CafeEmptyState message={t("no_activity")} />
        ) : (
          <CafeSection title={t("control_title")} description={t("control_hint")}>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("staff")}</TableHead>
                    <TableHead>{t("orders")}</TableHead>
                    <TableHead>{t("sales")}</TableHead>
                    <TableHead>{t("discounts")}</TableHead>
                    <TableHead>{t("discount_percent")}</TableHead>
                    <TableHead>{t("cancelled")}</TableHead>
                    <TableHead>{t("drawer_short")}</TableHead>
                    <TableHead>{t("drawer_over")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {control.data!.staff.map((row) => (
                    <TableRow key={row.user_id}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="tabular-nums">{toLocaleDigits(String(row.orders), locale)}</TableCell>
                      <TableCell>
                        <MoneyText amount={row.sales_minor} />
                      </TableCell>
                      <TableCell>
                        <MoneyText amount={row.discounts_minor} />
                      </TableCell>
                      <TableCell className="tabular-nums">{percent(row.discount_percent)}</TableCell>
                      <TableCell className="tabular-nums">
                        {toLocaleDigits(String(row.cancelled_orders), locale)}
                      </TableCell>
                      <TableCell className={row.short_minor > 0 ? "text-destructive" : undefined}>
                        <MoneyText amount={row.short_minor} />
                      </TableCell>
                      <TableCell>
                        <MoneyText amount={row.over_minor} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CafeSection>
        )
      ) : null}

      {tab === "ar-aging" ? (
        !aging.data ? (
          <CafeEmptyState message={t("unavailable")} />
        ) : (
          <CafeSection title={t("aging_title")} description={t("aging_hint")}>
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label={t("bucket_current")} value={<MoneyText amount={aging.data.buckets.current} />} />
              <Stat label={t("bucket_30")} value={<MoneyText amount={aging.data.buckets.days_30} />} />
              <Stat label={t("bucket_60")} value={<MoneyText amount={aging.data.buckets.days_60} />} />
              <Stat label={t("bucket_90")} value={<MoneyText amount={aging.data.buckets.days_90} />} />
            </div>

            {(aging.data.customers?.length ?? 0) === 0 ? (
              <CafeEmptyState message={t("no_receivables")} />
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("customer")}</TableHead>
                      <TableHead>{t("outstanding")}</TableHead>
                      <TableHead>{t("oldest_days")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aging.data.customers.map((row) => (
                      <TableRow key={row.person_id}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>
                          <MoneyText amount={row.total_minor} />
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {toLocaleDigits(String(row.oldest_days), locale)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CafeSection>
        )
      ) : null}
    </CafeAdminShell>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}
