"use client"

import { useQuery } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api, apiDownload } from "@/lib/api"
import { getApiErrorMessage, isForbiddenError } from "@/lib/api-helpers"
import { toLocaleDigits } from "@/lib/locale"
import { MoneyText } from "@/components/currency/MoneyDisplay"

import { CafeAdminShell, CafeEmptyState, CafeSection, cafeSelectClass } from "./cafe-admin-ui"

type Channel = { tender: string; orders: number; amount_minor: number }
type TopItem = { name: string; quantity: number; amount_minor: number }
type HourRow = { hour: number; orders: number; amount_minor: number }

type Overview = {
  range: string
  window: { from: string; to: string }
  currency: string
  sales: {
    orders: number
    revenue_minor: number
    aov_minor: number
    discounts_minor: number
    tax_minor: number
    shipping_minor: number
  }
  channels: Channel[]
  tables: {
    total: number
    occupied: number
    seats: number
    seated_seats: number
    occupancy_percent: number
    seat_utilization_percent: number
  }
  delivery: {
    queued: number
    claimed: number
    picked_up: number
    delivered: number
    failed: number
    active: number
  }
  tills: {
    open_shifts: number
    closed_today: number
    variance_minor: number
    shifts_with_variance: number
  }
  top_items: TopItem[]
  hourly: HourRow[]
}

const RANGES = ["today", "week", "month", "last7", "last30"] as const

export default function ManagerPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.manager")
  const tc = useTranslations("cafe_admin.pos_shift")
  const locale = useLocale()

  const [range, setRange] = useState<(typeof RANGES)[number]>("today")
  const [exporting, setExporting] = useState(false)

  async function runExport(format: "csv" | "xlsx") {
    setExporting(true)
    try {
      await apiDownload(
        `/api/v1/cafe/manager/export?range=${range}&format=${format}`,
        `cafe-report-${range}.${format}`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }

  const money = (v?: number | null) => (
    <MoneyText amount={v} currency={"IRT"} fallback="-" />
  )

  const overview = useQuery({
    queryKey: ["cafe-manager", range],
    queryFn: async () => {
      const res = await api<{ data: Overview }>(`/api/v1/cafe/manager/overview?range=${range}`)
      return res?.data ?? null
    },
    refetchInterval: 60_000,
  })

  const d = overview.data

  if (overview.isError) {
        // 403 means the role really lacks the capability. Anything else is a fault, and its own
        // message is the only clue the user gets — do not flatten it into «no access».
        const err = overview.error
        return (
          <CafeAdminShell title={t("title")} description={t("description")}>
            <CafeEmptyState
              message={isForbiddenError(err) ? t("no_access") : getApiErrorMessage(err)}
            />
          </CafeAdminShell>
        )
      }

  const maxHourly = Math.max(1, ...(d?.hourly ?? []).map((h) => h.amount_minor))

  return (
    <CafeAdminShell
      title={t("title")}
      description={t("description")}
      actions={
        <div className="flex items-center gap-2">
          <select
            className={cafeSelectClass}
            value={range}
            onChange={(e) => setRange(e.target.value as (typeof RANGES)[number])}
            aria-label={t("sales_title")}
          >
            {RANGES.map((r) => (
              <option key={r} value={r}>
                {t(`range_${r}`)}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => void overview.refetch()} disabled={overview.isFetching}>
            {t("refresh")}
          </Button>
          {/* Excel first: it is what a manager actually takes to a meeting. */}
          <Button
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={() => void runExport("xlsx")}
          >
            {t("export_xlsx")}
          </Button>
          <Button variant="outline" size="sm" disabled={exporting} onClick={() => void runExport("csv")}>
            {t("export_csv")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            {t("print")}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label={t("kpi_revenue")} value={money(d?.sales.revenue_minor ?? 0)} emphasis />
        <Kpi label={t("kpi_orders")} value={toLocaleDigits(d?.sales.orders ?? 0, locale)} />
        <Kpi label={t("kpi_aov")} value={money(d?.sales.aov_minor ?? 0)} />
        <Kpi label={t("kpi_discounts")} value={money(d?.sales.discounts_minor ?? 0)} />
        <Kpi label={t("kpi_tax")} value={money(d?.sales.tax_minor ?? 0)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CafeSection title={t("channels_title")}>
          {(d?.channels?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground text-sm">{t("channels_empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("tender")}</TableHead>
                  <TableHead>{t("tender_orders")}</TableHead>
                  <TableHead>{t("tender_amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d!.channels.map((c) => (
                  <TableRow key={c.tender}>
                    <TableCell>{c.tender}</TableCell>
                    <TableCell>{toLocaleDigits(c.orders, locale)}</TableCell>
                    <TableCell className="tabular-nums">{money(c.amount_minor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CafeSection>

        <CafeSection title={t("tables_title")}>
          <div className="grid grid-cols-2 gap-3">
            <Mini label={t("tables_total")} value={toLocaleDigits(d?.tables.total ?? 0, locale)} />
            <Mini label={t("tables_occupied")} value={toLocaleDigits(d?.tables.occupied ?? 0, locale)} />
            <Mini label={t("tables_occupancy")} value={`${toLocaleDigits(d?.tables.occupancy_percent ?? 0, locale)}٪`} />
            <Mini label={t("tables_seated_seats")} value={toLocaleDigits(d?.tables.seated_seats ?? 0, locale)} />
          </div>
        </CafeSection>

        <CafeSection title={t("delivery_title")}>
          <div className="grid grid-cols-2 gap-3">
            <Mini label={t("delivery_queued")} value={toLocaleDigits(d?.delivery.queued ?? 0, locale)} />
            <Mini label={t("delivery_active")} value={toLocaleDigits(d?.delivery.active ?? 0, locale)} />
            <Mini label={t("delivery_delivered")} value={toLocaleDigits(d?.delivery.delivered ?? 0, locale)} />
            <Mini label={t("delivery_failed")} value={toLocaleDigits(d?.delivery.failed ?? 0, locale)} />
          </div>
        </CafeSection>

        <CafeSection title={t("tills_title")}>
          <div className="grid grid-cols-2 gap-3">
            <Mini label={t("tills_open")} value={toLocaleDigits(d?.tills.open_shifts ?? 0, locale)} />
            <Mini label={t("tills_closed")} value={toLocaleDigits(d?.tills.closed_today ?? 0, locale)} />
            <Mini label={t("tills_with_variance")} value={toLocaleDigits(d?.tills.shifts_with_variance ?? 0, locale)} />
            <div className="rounded-xl border p-3">
              <p className="text-muted-foreground text-[11px]">{t("tills_variance")}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-lg font-semibold tabular-nums">
                {money(d?.tills.variance_minor ?? 0)}
                {(d?.tills.variance_minor ?? 0) !== 0 ? (
                  <Badge variant={d!.tills.variance_minor < 0 ? "destructive" : "outline"} className="text-[10px]">
                    {d!.tills.variance_minor < 0 ? tc("short") : tc("over")}
                  </Badge>
                ) : null}
              </p>
            </div>
          </div>
        </CafeSection>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CafeSection title={t("top_items_title")}>
          {(d?.top_items?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground text-sm">{t("top_items_empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("top_item_name")}</TableHead>
                  <TableHead>{t("top_item_qty")}</TableHead>
                  <TableHead>{t("top_item_amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d!.top_items.map((item) => (
                  <TableRow key={item.name}>
                    <TableCell className="max-w-[16rem] truncate">{item.name}</TableCell>
                    <TableCell>{toLocaleDigits(item.quantity, locale)}</TableCell>
                    <TableCell className="tabular-nums">{money(item.amount_minor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CafeSection>

        <CafeSection title={t("hourly_title")}>
          {(d?.hourly?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground text-sm">{t("hourly_empty")}</p>
          ) : (
            <div className="space-y-1.5">
              {d!.hourly.map((h) => (
                <div key={h.hour} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground w-10 shrink-0 tabular-nums">
                    {toLocaleDigits(h.hour, locale)}:00
                  </span>
                  <div className="bg-muted h-2.5 flex-1 overflow-hidden rounded">
                    <div
                      className="h-full rounded bg-emerald-500"
                      style={{ width: `${Math.max(2, Math.round((h.amount_minor / maxHourly) * 100))}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-end tabular-nums">{toLocaleDigits(h.orders, locale)}</span>
                </div>
              ))}
            </div>
          )}
        </CafeSection>
      </div>
    </CafeAdminShell>
  )
}

function Kpi({ label, value, emphasis }: { label: string; value: ReactNode; emphasis?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${emphasis ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950" : ""}`}>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-muted-foreground text-[11px]">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}
