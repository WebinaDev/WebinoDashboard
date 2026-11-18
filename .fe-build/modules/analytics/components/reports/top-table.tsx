"use client"

import type { ReactNode } from "react"
import { useTranslations } from "next-intl"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

export type TopColumn<T> = { id: string; header: string; align?: "start" | "end"; cell: (row: T) => ReactNode }

/** Compact non-paginated top-N table inside a card. */
export function TopTable<T>({
  title,
  rows,
  columns,
  rowKey,
}: {
  title: string
  rows: T[]
  columns: TopColumn<T>[]
  rowKey: (row: T, i: number) => string | number
}) {
  const t = useTranslations("reports")
  return (
    <Card className="min-w-0 overflow-hidden shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0 pb-2">
        {rows.length === 0 ? (
          <p className="text-muted-foreground px-6 py-6 text-center text-sm">{t("emptyHint")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c.id} className={cn("whitespace-nowrap", c.align === "end" && "text-end")}>
                    {c.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={rowKey(row, i)}>
                  {columns.map((c) => (
                    <TableCell key={c.id} className={cn(c.align === "end" && "text-end tabular-nums")}>
                      {c.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
