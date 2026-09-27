"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import type { DashboardOverviewProductRow } from "@/types/dashboardOverview"
import { MoneyDisplay } from "@/components/currency/MoneyDisplay"

type HomeProductTableProps = {
  title: string
  rows: DashboardOverviewProductRow[]
  viewAllHref?: string
  emptyMessage: string
  metricKey: "price" | "revenue" | "views"
  currency?: string
  locale: string
}

export function HomeProductTable({
  title,
  rows,
  viewAllHref,
  emptyMessage,
  metricKey,
  currency,
  locale,
}: HomeProductTableProps) {
  const t = useTranslations("home")
  const lng = normalizeUiLocale(locale)

  return (
    <Card className="min-w-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
        {viewAllHref ? (
          <Link
            className="text-xs text-primary hover:underline"
            href={viewAllHref}
          >
            {t("view_all")}
          </Link>
        ) : null}
      </CardHeader>
      <CardContent className="p-0 pt-2">
        {rows.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("tables.col_product")}</TableHead>
                <TableHead className="text-end">
                  {metricKey === "views"
                    ? t("tables.col_views")
                    : t("tables.col_total")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => {
                const id = row.id ?? row.product_id ?? i
                const metric =
                  metricKey === "views"
                    ? formatNumber(row.views ?? 0, lng)
                    : metricKey === "revenue"
                      ? <MoneyDisplay amount={Number(row.revenue) || 0} currency={currency} />
                      : <MoneyDisplay amount={Number(row.price) || 0} currency={currency} />
                return (
                  <TableRow key={id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {row.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.image_url}
                            alt=""
                            className="size-8 rounded object-cover"
                          />
                        ) : (
                          <span className="size-8 rounded bg-muted" />
                        )}
                        <Link
                          href={`/dashboard/products/${id}`}
                          className="line-clamp-2 text-sm hover:underline"
                        >
                          {row.name}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{metric}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
