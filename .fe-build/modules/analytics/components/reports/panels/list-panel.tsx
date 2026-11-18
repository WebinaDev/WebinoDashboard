"use client"

import type { ReactNode } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import { listTableProps, ReportDataTable, type ReportColumn } from "../report-data-table"
import type { ListReport } from "../types"
import { useReportList, useReportQuery, type ReportFilters, type ReportListState } from "../use-report-filters"
import { PanelState } from "./panel-state"

/** Server-paginated list section (products, coupons, …) with search / sort. */
export function ListPanel<T>({
  section,
  filters,
  defaultOrderby,
  columns,
  rowKey,
  title,
  emptyHint,
  header,
}: {
  section: string
  filters: ReportFilters
  defaultOrderby: string
  columns: (currency: string) => ReportColumn<T>[]
  rowKey: (row: T, i: number) => string | number
  title?: string
  emptyHint?: string
  header?: (data: ListReport<T>) => ReactNode
}) {
  const list = useReportList(defaultOrderby)
  const q = useReportQuery<ListReport<T>>(section, filters, list.params)
  return (
    <PanelState q={q}>
      {(data) => (
        <div className="space-y-4">
          {header?.(data)}
          <ListCard
            title={title}
            list={list}
            data={data}
            columns={columns(data.currency)}
            rowKey={rowKey}
            emptyHint={emptyHint}
            loading={q.isFetching}
          />
        </div>
      )}
    </PanelState>
  )
}

export function ListCard<T>({
  title,
  list,
  data,
  columns,
  rowKey,
  emptyHint,
  loading,
}: {
  title?: string
  list: ReportListState
  data: { items: T[]; total: number; page: number; per_page: number }
  columns: ReportColumn<T>[]
  rowKey: (row: T, i: number) => string | number
  emptyHint?: string
  loading?: boolean
}) {
  return (
    <Card className="shadow-sm">
      {title ? (
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">{title}</CardTitle>
        </CardHeader>
      ) : null}
      <CardContent className={title ? "pt-0" : "pt-6"}>
        <ReportDataTable
          rows={data.items ?? []}
          columns={columns}
          rowKey={rowKey}
          emptyHint={emptyHint}
          loading={loading}
          {...listTableProps(list, data)}
        />
      </CardContent>
    </Card>
  )
}
