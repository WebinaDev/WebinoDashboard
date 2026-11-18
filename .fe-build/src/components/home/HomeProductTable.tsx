"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { MobileListCard } from "@/components/MobileListCard"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate, formatNumber, normalizeUiLocale } from "@/lib/locale"
import type { DashboardOverviewProductRow } from "@/types/dashboardOverview"

type HomeProductTableProps = {
  title: string
  rows: DashboardOverviewProductRow[]
  viewAllHref?: string
  emptyMessage: string
  metricKey: "price" | "revenue" | "views"
  currency?: string
  locale: string
}

function productId(row: DashboardOverviewProductRow, index: number) {
  return row.product_id ?? row.id ?? index
}

export function HomeProductTable({
  title,
  rows = [],
  viewAllHref,
  emptyMessage,
  metricKey,
  currency,
  locale,
}: HomeProductTableProps) {
  const t = useTranslations("home")
  const tCatalog = useTranslations("catalog")
  const tReports = useTranslations("reports")
  const lng = normalizeUiLocale(locale)

  const metricLabel =
    metricKey === "views"
      ? t("tables.col_views")
      : metricKey === "revenue"
        ? tReports("revenue")
        : metricKey === "price"
          ? tCatalog("col_price")
          : null

  function renderMetric(row: DashboardOverviewProductRow) {
    if (!metricKey) return null
    if (metricKey === "views") return formatNumber(row.views ?? 0, lng)
    if (metricKey === "revenue") {
      return (
        <MoneyDisplay amount={Number(row.revenue) || 0} currency={currency} />
      )
    }
    if (metricKey === "price") {
      return (
        <MoneyDisplay amount={Number(row.price) || 0} currency={currency} />
      )
    }
    return null
  }

  return (
    <Card className="min-w-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="min-w-0 text-base font-medium">{title}</CardTitle>
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
              {rows.map((row, i) => {
                const id = productId(row, i)
                return (
                  <MobileListCard
                    key={id}
                    media={
                      <div className="flex gap-3">
                        <Avatar className="size-12 shrink-0 rounded-lg">
                          {row.image_url ? (
                            <AvatarImage src={row.image_url} alt="" />
                          ) : null}
                          <AvatarFallback className="rounded-lg text-xs">
                            {row.name.slice(0, 1)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1 space-y-1">
                          <Link
                            className="line-clamp-2 break-words font-medium text-primary hover:underline"
                            href={`/dashboard/products/${id}`}
                          >
                            {row.name}
                          </Link>
                          {row.date && metricKey !== "price" ? (
                            <p className="text-xs text-muted-foreground">
                              {formatDate(row.date, lng, { dateStyle: "short" })}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    }
                  >
                    {metricLabel ? (
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">{metricLabel}</span>
                        <span className="min-w-0 text-end">{renderMetric(row)}</span>
                      </div>
                    ) : null}
                  </MobileListCard>
                )
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12" />
                    <TableHead>{t("tables.col_product")}</TableHead>
                    {metricLabel ? (
                      <TableHead className="text-end">{metricLabel}</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => {
                    const id = productId(row, i)
                    return (
                      <TableRow key={id} className="hover:bg-muted/50">
                        <TableCell>
                          <Avatar className="size-9 rounded-md">
                            {row.image_url ? (
                              <AvatarImage src={row.image_url} alt="" />
                            ) : null}
                            <AvatarFallback className="rounded-md text-xs">
                              {row.name.slice(0, 1)}
                            </AvatarFallback>
                          </Avatar>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/dashboard/products/${id}`}
                            className="line-clamp-2 hover:underline"
                          >
                            {row.name}
                          </Link>
                          {row.date && metricKey !== "price" ? (
                            <p className="text-xs text-muted-foreground">
                              {formatDate(row.date, lng, { dateStyle: "short" })}
                            </p>
                          ) : null}
                        </TableCell>
                        {metricLabel ? (
                          <TableCell className="text-end tabular-nums">
                            {renderMetric(row)}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
