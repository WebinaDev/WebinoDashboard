"use client"

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ExternalLink, LayoutTemplate, Pencil, RotateCcw, Search, SlidersHorizontal, Trash2 } from "lucide-react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { Fragment, useState } from "react"
import { toast } from "sonner"

import { EmptyListCta } from "@/components/content/EmptyListCta"
import { ListColumnPicker, useListColumnVisibility } from "@/components/content/ListColumnPicker"
import { useConfirm } from "@/components/ConfirmDialog"
import { ListStatsStrip } from "@/components/ListStatsStrip"
import { MobileListCard, MobileListField } from "@/components/MobileListCard"
import { PageShell } from "@/components/PageShell"
import { PostsPagination } from "@/components/PostsPagination"
import { QueryErrorState } from "@/components/QueryErrorState"
import { ScrollTable } from "@/components/ScrollTable"
import { TableListSkeleton } from "@/components/TableListSkeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { statusBadgeVariant, useEnumLabel } from "@/lib/enum-labels"
import { formatDisplayDate } from "@/lib/format-date"

type PageRow = {
  id: number
  title: string
  status: string
  date?: string
  parent?: number | null
  slug: string
  excerpt?: string
  url?: string
}

const PAGE_COLUMNS = ["title", "status", "date", "excerpt"] as const
type PageColumn = (typeof PAGE_COLUMNS)[number]
const LS_PAGE_COLUMNS = "webino-pages-list-columns"
const DEFAULT_PAGE_COLUMNS: Record<PageColumn, boolean> = {
  title: true,
  status: true,
  date: true,
  excerpt: false,
}

type ListPayload = {
  items: PageRow[]
  found: number
  stats: { total: number; publish: number; draft: number; pending: number; trash?: number }
}

const selectClass = "border-input bg-background h-9 rounded-md border px-2 text-sm"

export default function CmsPagesListPage(_props: { route: ResolvedAdminRoute }) {
  const t = useTranslations("content_admin")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const enumLabel = useEnumLabel()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [search, setSearch] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")
  const [status, setStatus] = useState("")
  const [quickId, setQuickId] = useState<number | null>(null)
  const [quickTitle, setQuickTitle] = useState("")
  const [quickStatus, setQuickStatus] = useState("draft")
  const [quickParent, setQuickParent] = useState("")
  const [columns, toggleColumn] = useListColumnVisibility(LS_PAGE_COLUMNS, DEFAULT_PAGE_COLUMNS)
  const columnLabels: Record<PageColumn, string> = {
    title: t("col_title"),
    status: t("col_status"),
    date: t("col_date"),
    excerpt: t("col_excerpt"),
  }

  const q = useQuery({
    queryKey: ["cms", "pages", page, perPage, appliedSearch, status],
    placeholderData: keepPreviousData,
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), per_page: String(perPage) })
      if (appliedSearch) p.set("search", appliedSearch)
      if (status) p.set("status", status)
      return api<ListPayload>(`/api/v1/cms/pages?${p}`)
    },
  })

  const parentsQ = useQuery({
    queryKey: ["cms", "pages", "parents"],
    enabled: quickId !== null,
    queryFn: () => api<ListPayload>("/api/v1/cms/pages?per_page=100"),
  })

  const patchMut = useMutation({
    mutationFn: ({ id, json }: { id: number; json: Record<string, unknown> }) =>
      api(`/api/v1/cms/pages/${id}`, { method: "PATCH", json }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      setQuickId(null)
      void qc.invalidateQueries({ queryKey: ["cms", "pages"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const deleteMut = useMutation({
    mutationFn: ({ id, force }: { id: number; force?: boolean }) =>
      api(`/api/v1/cms/pages/${id}${force ? "?force=1" : ""}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t("deleted"))
      void qc.invalidateQueries({ queryKey: ["cms", "pages"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const items = q.data?.items ?? []
  const stats = q.data?.stats
  const parentOptions = (parentsQ.data?.items ?? items).filter((p) => p.id !== quickId)

  function openQuick(row: PageRow) {
    setQuickId(row.id)
    setQuickTitle(row.title)
    setQuickStatus(row.status)
    setQuickParent(row.parent ? String(row.parent) : "")
  }

  function rowActions(row: PageRow) {
    return (
      <div className="flex flex-wrap justify-end gap-1">
        {row.url ? (
          <Button size="icon" variant="outline" asChild title={t("view_on_site")}>
            <Link href={row.url} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
            </Link>
          </Button>
        ) : null}
        <Button size="icon" variant="outline" asChild title={t("edit_page")}>
          <Link href={`/dashboard/pages/${row.id}`}>
            <Pencil className="size-4" />
          </Link>
        </Button>
        <Button size="icon" variant="outline" asChild title={t("open_builder")}>
          <Link href={`/dashboard/builder/${row.id}`}>
            <LayoutTemplate className="size-4" />
            <span className="sr-only">{t("open_builder")}</span>
          </Link>
        </Button>
        <Button type="button" size="icon" variant="ghost" title={t("quick_edit")} onClick={() => openQuick(row)}>
          <SlidersHorizontal className="size-4" />
          <span className="sr-only">{t("quick_edit")}</span>
        </Button>
        {row.status === "trash" || status === "trash" ? (
          <Button
            type="button"
            size="icon"
            variant="outline"
            title={t("restore")}
            onClick={() =>
              api(`/api/v1/cms/pages/${row.id}/restore`, { method: "POST" }).then(() => {
                toast.success(tCommon("saved"))
                void qc.invalidateQueries({ queryKey: ["cms", "pages"] })
              })
            }
          >
            <RotateCcw className="size-4" />
          </Button>
        ) : null}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          title={t("delete")}
          onClick={() =>
            confirm({
              description: row.title,
              onConfirm: () => deleteMut.mutateAsync({ id: row.id, force: row.status === "trash" || status === "trash" }),
            })
          }
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    )
  }

  const quickForm = (row: PageRow) => (
    <div className="flex flex-wrap gap-2">
      <Input className="max-w-xs" value={quickTitle} onChange={(e) => setQuickTitle(e.target.value)} />
      <select className={selectClass} value={quickStatus} onChange={(e) => setQuickStatus(e.target.value)}>
        {(["draft", "pending", "published"] as const).map((s) => (
          <option key={s} value={s}>
            {enumLabel("post_status", s)}
          </option>
        ))}
      </select>
      <select className={selectClass} value={quickParent} onChange={(e) => setQuickParent(e.target.value)}>
        <option value="">{t("no_parent")}</option>
        {parentOptions.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
      <Button
        type="button"
        size="sm"
        disabled={patchMut.isPending}
        onClick={() =>
          void patchMut.mutateAsync({
            id: row.id,
            json: {
              title: quickTitle,
              status: quickStatus,
              parent_id: quickParent ? Number(quickParent) : null,
            },
          })
        }
      >
        {tCommon("save")}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setQuickId(null)}>
        {tCommon("cancel")}
      </Button>
    </div>
  )

  return (
    <PageShell
      title={t("pages_title")}
      description={t("pages_subtitle")}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={status === "trash" ? "default" : "outline"} onClick={() => { setStatus((s) => (s === "trash" ? "" : "trash")); setPage(1) }}>
            {status === "trash" ? t("show_active") : t("show_trash")}
          </Button>
          <Button asChild>
            <Link href="/dashboard/pages/new">{t("add_page")}</Link>
          </Button>
        </div>
      }
    >
      {stats ? (
        <ListStatsStrip
          items={[
            { id: "total", label: t("stat_total"), value: stats.total },
            { id: "publish", label: t("stat_publish"), value: stats.publish },
            { id: "draft", label: t("stat_draft"), value: stats.draft },
            { id: "pending", label: t("stat_pending"), value: stats.pending },
            { id: "trash", label: t("show_trash"), value: stats.trash ?? 0 },
          ]}
        />
      ) : null}

      <div className="flex flex-wrap justify-end">
        <ListColumnPicker
          label={t("toggle_columns")}
          columns={columns}
          columnLabels={columnLabels}
          onToggle={toggleColumn}
        />
      </div>

      <div className="relative">
        <Search className="text-muted-foreground absolute start-2 top-2.5 size-4" />
        <Input
          className="ps-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setAppliedSearch(search.trim())
              setPage(1)
            }
          }}
          placeholder={t("search_ph")}
        />
      </div>

      <div className="rounded-xl border bg-card/40 p-2 sm:p-4">
        {q.isError ? (
          <QueryErrorState onRetry={() => q.refetch()} />
        ) : q.isPending ? (
          <TableListSkeleton rows={6} columns={3} />
        ) : items.length === 0 ? (
          <EmptyListCta message={t("empty_pages")} actionLabel={t("add_page")} actionHref="/dashboard/pages/new" />
        ) : (
          <>
            <div className="space-y-2 md:hidden">
              {items.map((row) => (
                <MobileListCard
                  key={row.id}
                  media={
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/dashboard/pages/${row.id}`} className="font-medium hover:underline">
                          {row.title}
                        </Link>
                        <p className="text-muted-foreground truncate text-xs" dir="ltr">
                          {row.slug}
                        </p>
                      </div>
                      <Badge variant={statusBadgeVariant(row.status)}>{enumLabel("post_status", row.status)}</Badge>
                    </div>
                  }
                  actions={rowActions(row)}
                >
                  <MobileListField label={t("col_date")}>{formatDisplayDate(row.date, locale)}</MobileListField>
                  {quickId === row.id ? quickForm(row) : null}
                </MobileListCard>
              ))}
            </div>
            <ScrollTable className="hidden md:block">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground border-b">
                  <tr>
                    {columns.title ? <th className="p-3 text-start font-medium">{t("col_title")}</th> : null}
                    {columns.status ? <th className="p-3 text-start font-medium">{t("col_status")}</th> : null}
                    {columns.date ? <th className="p-3 text-start font-medium">{t("col_date")}</th> : null}
                    {columns.excerpt ? <th className="p-3 text-start font-medium">{t("col_excerpt")}</th> : null}
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <Fragment key={row.id}>
                      <tr className="border-b last:border-0">
                        {columns.title ? (
                          <td className="p-3">
                            <Link href={`/dashboard/pages/${row.id}`} className="font-medium hover:underline">
                              {row.title}
                            </Link>
                            <p className="text-muted-foreground text-xs" dir="ltr">
                              {row.slug}
                            </p>
                          </td>
                        ) : null}
                        {columns.status ? (
                          <td className="p-3">
                            <Badge variant={statusBadgeVariant(row.status)}>{enumLabel("post_status", row.status)}</Badge>
                          </td>
                        ) : null}
                        {columns.date ? (
                          <td className="text-muted-foreground p-3 text-xs">{formatDisplayDate(row.date, locale)}</td>
                        ) : null}
                        {columns.excerpt ? (
                          <td className="text-muted-foreground max-w-xs truncate p-3 text-xs">{row.excerpt ?? "—"}</td>
                        ) : null}
                        <td className="p-3">{rowActions(row)}</td>
                      </tr>
                      {quickId === row.id ? (
                        <tr className="bg-muted/20 border-b">
                          <td colSpan={PAGE_COLUMNS.filter((c) => columns[c]).length + 1} className="p-3">
                            {quickForm(row)}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
          </>
        )}
        <PostsPagination
          className="mt-4"
          page={page}
          perPage={perPage}
          found={q.data?.found ?? 0}
          onPageChange={setPage}
          onPerPageChange={(n) => {
            setPerPage(n)
            setPage(1)
          }}
        />
      </div>
      {confirmDialog}
    </PageShell>
  )
}
