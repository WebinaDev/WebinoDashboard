"use client"

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
import { MoneyDisplay } from "@/components/currency/MoneyDisplay"

type TopCategoriesTableProps = {
  rows: Array<{ term_id: number; name: string; quantity: number; revenue: number }>
  currency?: string
  locale: string
}

export function TopCategoriesTable({
  rows = [],
  currency,
  locale,
}: TopCategoriesTableProps) {
  const t = useTranslations("reports")
  const lng = normalizeUiLocale(locale)

  return (
    <Card className="min-w-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">{t("table.topCategories")}</CardTitle>
      </CardHeader>
      <CardContent className="p-0 pt-2">
        {rows.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">{t("emptyHint")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.category")}</TableHead>
                <TableHead className="text-end">{t("kpi.itemsSold")}</TableHead>
                <TableHead className="text-end">{t("revenue")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.term_id || row.name}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell className="text-end tabular-nums">
                    {formatNumber(row.quantity, lng)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    <MoneyDisplay amount={row.revenue} currency={currency} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

type TopCustomersTableProps = {
  rows: Array<{
    customer_id: number
    name: string
    email: string
    orders: number
    revenue: number
  }>
  currency?: string
  locale: string
}

export function TopCustomersTable({
  rows = [],
  currency,
  locale,
}: TopCustomersTableProps) {
  const t = useTranslations("reports")
  const lng = normalizeUiLocale(locale)

  return (
    <Card className="min-w-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">{t("table.topCustomers")}</CardTitle>
      </CardHeader>
      <CardContent className="p-0 pt-2">
        {rows.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">{t("emptyHint")}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.customer")}</TableHead>
                  <TableHead className="text-end">{t("orders")}</TableHead>
                  <TableHead className="text-end">{t("revenue")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.customer_id || row.email}>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{row.name || "—"}</p>
                        {row.email ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {row.email}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {formatNumber(row.orders, lng)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      <MoneyDisplay amount={row.revenue} currency={currency} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
