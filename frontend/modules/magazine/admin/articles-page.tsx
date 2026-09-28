"use client"

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Search, Trash2 } from "lucide-react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { EmptyListCta } from "@/components/content/EmptyListCta"
import { ListColumnPicker, useListColumnVisibility } from "@/components/content/ListColumnPicker"
import { useConfirm } from "@/components/ConfirmDialog"
import type { SimpleSeo } from "@/components/seo/SimpleSeoFields"
import { Badge } from "@/components/ui/badge"
import { ListStatsStrip } from "@/components/ListStatsStrip"
import { MobileListCard, MobileListField } from "@/components/MobileListCard"
import { PageShell } from "@/components/PageShell"
import { PostsPagination } from "@/components/PostsPagination"
import { QueryErrorState } from "@/components/QueryErrorState"
import { ScrollTable } from "@/components/ScrollTable"
import { TableListSkeleton } from "@/components/TableListSkeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { statusBadgeVariant, useEnumLabel } from "@/lib/enum-labels"
import { SeoKeywordIndicator } from "@/components/seo/SeoKeywordIndicator"
import { formatDisplayDate } from "@/lib/format-date"

type PostRow = {
  id: number
  title: string
  status: string
  date?: string
  excerpt?: string
  seo?: SimpleSeo | null
}
const MAG_COLUMNS = ["title", "status", "date", "excerpt", "seo"] as const
type MagColumn = (typeof MAG_COLUMNS)[number]
const LS_MAG_COLUMNS = "webino-magazine-list-columns"
const DEFAULT_MAG_COLUMNS: Record<MagColumn, boolean> = {
  title: true,
  status: true,
  date: true,
  excerpt: false,
  seo: true,
}

type ListPayload = {
  items: PostRow[]
  found: number
  page: number
  stats: { total: number; publish: number; draft: number; pending: number }
}

export default function MagazinePostsPage(_props: { route: ResolvedAdminRoute }) {
  const t = useTranslations("content_admin")
  const locale = useLocale()
  const enumLabel = useEnumLabel()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [search, setSearch] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")
  const [columns, toggleColumn] = useListColumnVisibility(LS_MAG_COLUMNS, DEFAULT_MAG_COLUMNS)
  const columnLabels: Record<MagColumn, string> = {
    title: t("col_title"),
    status: t("col_status"),
    date: t("col_date"),
    excerpt: t("col_summary"),
    seo: t("col_seo"),
  }

  const q = useQuery({
    queryKey: ["magazine", "posts", page, perPage, appliedSearch],
    placeholderData: keepPreviousData,
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), per_page: String(perPage) })
      if (appliedSearch) p.set("search", appliedSearch)
      return api<ListPayload>(`/api/v1/magazine/articles?${p}`)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api(`/api/v1/magazine/articles/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t("deleted"))
      void qc.invalidateQueries({ queryKey: ["magazine", "posts"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const stats = q.data?.stats
  const items = q.data?.items ?? []

  function rowActions(row: PostRow) {
    return (
      <div className="flex justify-end gap-1">
        <Button size="icon" variant="outline" asChild title={t("edit_post")}>
          <Link href={`/dashboard/magazine/posts/${row.id}`}>
            <Pencil className="size-4" />
          </Link>
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          title={t("delete")}
          onClick={() => confirm({ description: row.title, onConfirm: () => deleteMut.mutateAsync(row.id) })}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    )
  }

  return (
    <PageShell
      title={t("posts_title")}
      description={t("posts_subtitle")}
      actions={
        <Button asChild>
          <Link href="/dashboard/magazine/new">{t("add_post")}</Link>
        </Button>
      }
    >
      {stats ? (
        <ListStatsStrip
          items={[
            { id: "total", label: t("stat_total"), value: stats.total },
            { id: "publish", label: t("stat_publish"), value: stats.publish },
            { id: "draft", label: t("stat_draft"), value: stats.draft },
            { id: "pending", label: t("stat_pending"), value: stats.pending },
          ]}
        />
      ) : null}

      <div className="flex flex-wrap justify-end">
        <ListColumnPicker label={t("toggle_columns")} columns={columns} columnLabels={columnLabels} onToggle={toggleColumn} />
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
          <TableListSkeleton rows={6} columns={4} />
        ) : items.length === 0 ? (
          <EmptyListCta message={t("empty_posts")} actionLabel={t("add_post")} actionHref="/dashboard/magazine/new" />
        ) : (
          <>
            <div className="space-y-2 md:hidden">
              {items.map((row) => (
                <MobileListCard
                  key={row.id}
                  media={
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/dashboard/magazine/posts/${row.id}`} className="font-medium hover:underline">
                        {row.title}
                      </Link>
                      <Badge variant={statusBadgeVariant(row.status)}>{enumLabel("post_status", row.status)}</Badge>
                    </div>
                  }
                  actions={rowActions(row)}
                >
                  <MobileListField label={t("col_date")}>{formatDisplayDate(row.date, locale)}</MobileListField>
                  <MobileListField label={t("seo")}>
                    <SeoKeywordIndicator seo={row.seo} title={row.title} excerpt={row.excerpt} />
                  </MobileListField>
                </MobileListCard>
              ))}
            </div>
            <ScrollTable className="hidden md:block">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground border-b">
                  <tr>
                    <th className="p-3 text-start font-medium">{t("col_title")}</th>
                    {columns.status ? <th className="p-3 text-start font-medium">{t("col_status")}</th> : null}
                    {columns.date ? <th className="p-3 text-start font-medium">{t("col_date")}</th> : null}
                    {columns.excerpt ? <th className="p-3 text-start font-medium">{t("col_summary")}</th> : null}
                    {columns.seo ? <th className="p-3 text-start font-medium">{t("col_seo")}</th> : null}
                    <th className="p-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="p-3">
                        <Link href={`/dashboard/magazine/posts/${row.id}`} className="font-medium hover:underline">
                          {row.title}
                        </Link>
                      </td>
                      {columns.status ? (
                        <td className="p-3">
                          <Badge variant={statusBadgeVariant(row.status)}>{enumLabel("post_status", row.status)}</Badge>
                        </td>
                      ) : null}
                      {columns.date ? (
                        <td className="text-muted-foreground p-3 text-xs">{formatDisplayDate(row.date, locale)}</td>
                      ) : null}
                      {columns.excerpt ? (
                        <td className="text-muted-foreground max-w-xs p-3 text-xs">
                          <span className="line-clamp-2">{row.excerpt || "—"}</span>
                        </td>
                      ) : null}
                      {columns.seo ? (
                        <td className="p-3">
                          <SeoKeywordIndicator seo={row.seo} title={row.title} excerpt={row.excerpt} />
                        </td>
                      ) : null}
                      <td className="p-3">{rowActions(row)}</td>
                    </tr>
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
