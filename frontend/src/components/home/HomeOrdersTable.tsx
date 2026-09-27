"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { MobileListCard } from "@/components/MobileListCard"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useEnumLabel } from "@/lib/enum-labels"
import { formatDate, formatNumber, normalizeUiLocale } from "@/lib/locale"
import type { DashboardOverviewOrderRow } from "@/types/dashboardOverview"

type HomeOrdersTableProps = {
  title: string
  rows: DashboardOverviewOrderRow[]
  monthLabel?: string
  viewAllHref?: string
  orderHrefBase?: string
  emptyMessage: string
  currency?: string
  locale: string
}

function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "completed":
    case "paid":
      return "default"
    case "processing":
    case "shipped":
      return "secondary"
    case "cancelled":
    case "failed":
    case "refunded":
    case "payment_failed":
      return "destructive"
    default:
      return "outline"
  }
}

export function HomeOrdersTable({
  title,
  rows,
  monthLabel,
  viewAllHref,
  orderHrefBase = "/dashboard/orders",
  emptyMessage,
  currency,
  locale,
}: HomeOrdersTableProps) {
  const t = useTranslations("home")
  const enumLabel = useEnumLabel()
  const lng = normalizeUiLocale(locale)

  return (
    <Card className="min-w-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="min-w-0">
          <CardTitle className="text-base font-medium">{title}</CardTitle>
          {monthLabel ? (
            <p className="text-xs text-muted-foreground">{monthLabel}</p>
          ) : null}
        </div>
        {viewAllHref ? (
          <Link
            className="shrink-0 text-xs text-primary hover:underline"
            href={viewAllHref}
          >
            {t("view_all")}
          </Link>
        ) : null}
      </CardHeader>
      <CardContent className="min-w-0 p-0 pt-2">
        {rows.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <>
            <div className="space-y-3 px-3 pb-3 md:hidden">
              {rows.map((row) => (
                <MobileListCard
                  key={row.id}
                  media={
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <Link
                          className="font-medium text-primary hover:underline"
                          href={`${orderHrefBase}/${row.id}`}
                        >
                          #{formatNumber(Number(row.number) || row.id, lng)}
                        </Link>
                        <p className="truncate text-sm">{row.customer_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.date
                            ? formatDate(row.date, lng, { dateStyle: "short" })
                            : "—"}
                        </p>
                      </div>
                      <Badge variant={statusBadgeVariant(row.status)} className="shrink-0">
                        {enumLabel("order_status", row.status) ||
                          row.status_label ||
                          row.status}
                      </Badge>
                    </div>
                  }
                >
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">{t("tables.col_total")}</span>
                    <MoneyDisplay amount={Number(row.total) || 0} currency={currency} />
                  </div>
                </MobileListCard>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("tables.col_order")}</TableHead>
                    <TableHead>{t("tables.col_customer")}</TableHead>
                    <TableHead>{t("tables.col_status")}</TableHead>
                    <TableHead className="text-end">{t("tables.col_total")}</TableHead>
                    <TableHead className="text-end">{t("tables.col_date")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} className="hover:bg-muted/50">
                      <TableCell>
                        <Link
                          className="font-medium text-primary hover:underline"
                          href={`${orderHrefBase}/${row.id}`}
                        >
                          #{formatNumber(Number(row.number) || row.id, lng)}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[10rem] truncate">
                        {row.customer_name || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(row.status)}>
                          {enumLabel("order_status", row.status) ||
                            row.status_label ||
                            row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        <MoneyDisplay amount={Number(row.total) || 0} currency={currency} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-end text-xs text-muted-foreground">
                        {row.date
                          ? formatDate(row.date, lng, { dateStyle: "short" })
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
