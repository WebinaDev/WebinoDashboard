"use client"

import { useMemo, useState, type ReactNode } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react"
import { useTranslations } from "next-intl"

import { MobileListCard, MobileListField } from "@/components/MobileListCard"
import { PostsPagination } from "@/components/PostsPagination"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

import type { ReportListState } from "./use-report-filters"

export type ReportColumn<T> = {
  id: string
  header: string
  align?: "start" | "end"
  sortable?: boolean
  cell: (row: T) => ReactNode
  /** Hide on the mobile card (still shown in the desktop table). */
  hideOnMobile?: boolean
}

type ReportDataTableProps<T> = {
  rows: T[]
  columns: ReportColumn<T>[]
  rowKey: (row: T, index: number) => string | number
  total?: number
  page?: number
  perPage?: number
  orderby?: string
  order?: "asc" | "desc"
  onSortChange?: (key: string) => void
  search?: string
  onSearchChange?: (v: string) => void
  onPageChange?: (page: number) => void
  onPerPageChange?: (n: number) => void
  emptyHint?: string
  toolbar?: ReactNode
  loading?: boolean
}

export function ReportDataTable<T>({
  rows,
  columns,
  rowKey,
  total,
  page = 1,
  perPage = 25,
  orderby,
  order,
  onSortChange,
  search,
  onSearchChange,
  onPageChange,
  onPerPageChange,
  emptyHint,
  toolbar,
  loading,
}: ReportDataTableProps<T>) {
  const t = useTranslations("reports")

  const sortIcon = (id: string) =>
    orderby === id ? (
      order === "asc" ? (
        <ArrowUp className="size-3" />
      ) : (
        <ArrowDown className="size-3" />
      )
    ) : (
      <ArrowUpDown className="size-3 opacity-40" />
    )

  return (
    <div className={cn("min-w-0 space-y-3", loading && "opacity-60 transition-opacity")}>
      {onSearchChange || toolbar ? (
        <div className="flex flex-wrap items-center gap-2">
          {onSearchChange ? (
            <div className="relative w-full max-w-xs">
              <Search className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2" />
              <Input
                value={search ?? ""}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="ps-8"
              />
            </div>
          ) : null}
          {toolbar}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
          {emptyHint ?? t("emptyHint")}
        </p>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {rows.map((row, idx) => {
              const [first, ...rest] = columns.filter((c) => !c.hideOnMobile)
              return (
                <MobileListCard key={rowKey(row, idx)}>
                  {first ? <div className="font-medium break-words">{first.cell(row)}</div> : null}
                  {rest.map((col) => (
                    <MobileListField key={col.id} label={col.header}>
                      {col.cell(row)}
                    </MobileListField>
                  ))}
                </MobileListCard>
              )
            })}
          </div>

          <div className="hidden overflow-x-auto rounded-md border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((col) => (
                    <TableHead key={col.id} className={cn("whitespace-nowrap", col.align === "end" && "text-end")}>
                      {col.sortable && onSortChange ? (
                        <button
                          type="button"
                          className="hover:text-foreground inline-flex items-center gap-1"
                          onClick={() => onSortChange(col.id)}
                        >
                          {col.header}
                          {sortIcon(col.id)}
                        </button>
                      ) : (
                        col.header
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => (
                  <TableRow key={rowKey(row, idx)}>
                    {columns.map((col) => (
                      <TableCell key={col.id} className={cn(col.align === "end" && "text-end tabular-nums")}>
                        {col.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {onPageChange && total !== undefined ? (
        <PostsPagination
          page={page}
          perPage={perPage}
          found={total}
          onPageChange={onPageChange}
          onPerPageChange={onPerPageChange}
          showPerPageSelector={Boolean(onPerPageChange)}
          perPageOptions={[10, 25, 50, 100]}
        />
      ) : null}
    </div>
  )
}

/** Props bundle wiring `useReportList` state + a server list payload into `ReportDataTable`. */
export function listTableProps(
  state: ReportListState,
  data: { total?: number; page?: number; per_page?: number } | undefined,
) {
  return {
    total: data?.total ?? 0,
    page: data?.page ?? state.page,
    perPage: data?.per_page ?? state.perPage,
    orderby: state.orderby,
    order: state.order,
    onSortChange: state.onSortChange,
    search: state.search,
    onSearchChange: state.setSearch,
    onPageChange: state.setPage,
    onPerPageChange: state.setPerPage,
  }
}

/** Client-side search / sort / paging for small in-memory lists (e.g. financial breakdowns). */
export function useLocalTable<T extends object>(
  rows: T[],
  searchText: (row: T) => string,
  defaultOrderby: string,
  perPage = 25,
) {
  const [search, setSearchRaw] = useState("")
  const [page, setPage] = useState(1)
  const [orderby, setOrderby] = useState(defaultOrderby)
  const [order, setOrder] = useState<"asc" | "desc">("desc")

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const out = q ? rows.filter((r) => searchText(r).toLowerCase().includes(q)) : [...rows]
    out.sort((a, b) => {
      const av = (a as Record<string, unknown>)[orderby]
      const bv = (b as Record<string, unknown>)[orderby]
      const cmp =
        typeof av === "number" && typeof bv === "number" ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""))
      return order === "asc" ? cmp : -cmp
    })
    return out
  }, [rows, search, searchText, orderby, order])

  const current = Math.min(page, Math.max(1, Math.ceil(filtered.length / perPage)))

  return {
    rows: filtered.slice((current - 1) * perPage, current * perPage),
    total: filtered.length,
    page: current,
    perPage,
    orderby,
    order,
    search,
    onSearchChange: (v: string) => {
      setSearchRaw(v)
      setPage(1)
    },
    onPageChange: setPage,
    onSortChange: (key: string) => {
      if (key === orderby) setOrder((o) => (o === "asc" ? "desc" : "asc"))
      else {
        setOrderby(key)
        setOrder("desc")
      }
      setPage(1)
    },
  }
}
