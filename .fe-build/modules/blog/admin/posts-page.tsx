"use client"

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { LayoutTemplate, Pencil, RotateCcw, Search, Trash2 } from "lucide-react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

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
import { SeoKeywordIndicator } from "@/components/seo/SeoKeywordIndicator"
import type { SimpleSeo } from "@/components/seo/SimpleSeoFields"
import { formatDisplayDate } from "@/lib/format-date"

type PostRow = {
  id: number
  title: string
  status: string
  date?: string
  excerpt?: string
  category?: { id: number; name: string } | null
  seo?: SimpleSeo | null
}
type ListPayload = {
  items: PostRow[]
  found: number
  page: number
  stats: { total: number; publish: number; draft: number; pending: number }
}

export default function BlogPostsPage(_props: { route: ResolvedAdminRoute }) {
  const t = useTranslations("content_admin")
  const tCommon = useTranslations("common")
  const tUi = useTranslations("ui")
  const locale = useLocale()
  const enumLabel = useEnumLabel()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [search, setSearch] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")
  const [status, setStatus] = useState("")

  const q = useQuery({
    queryKey: ["blog", "posts", page, perPage, appliedSearch, status],
    placeholderData: keepPreviousData,
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), per_page: String(perPage) })
      if (appliedSearch) p.set("search", appliedSearch)
      if (status) p.set("status", status)
      return api<ListPayload>(`/api/v1/blog/posts?${p}`)
    },
  })

  const deleteMut = useMutation({
    mutationFn: ({ id, force }: { id: number; force?: boolean }) =>
      api(`/api/v1/blog/posts/${id}${force ? "?force=1" : ""}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t("deleted"))
      void qc.invalidateQueries({ queryKey: ["blog", "posts"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const stats = q.data?.stats
  const items = q.data?.items ?? []

  function askDelete(row: PostRow) {
    confirm({
      description: row.title,
      onConfirm: () => deleteMut.mutateAsync({ id: row.id, force: row.status === "trash" || status === "trash" }),
    })
  }

  function rowActions(row: PostRow) {
    return (
      <div className="flex justify-end gap-1">
        <Button size="icon" variant="outline" asChild title={t("edit_post")}>
          <Link href={`/dashboard/blog/posts/${row.id}`}>
            <Pencil className="size-4" />
          </Link>
        </Button>
        <Button size="icon" variant="outline" asChild title={t("open_builder")}>
          <Link href={`/dashboard/builder/post/${row.id}`}>
            <LayoutTemplate className="size-4" />
            <span className="sr-only">{t("open_builder")}</span>
          </Link>
        </Button>
        {row.status === "trash" || status === "trash" ? (
          <Button
            type="button"
            size="icon"
            variant="outline"
            title={t("restore")}
            onClick={() =>
              api(`/api/v1/blog/posts/${row.id}/restore`, { method: "POST" }).then(() => {
                toast.success(tCommon("saved"))
                void qc.invalidateQueries({ queryKey: ["blog", "posts"] })
              })
            }
          >
            <RotateCcw className="size-4" />
          </Button>
        ) : null}
        <Button type="button" size="icon" variant="ghost" title={t("delete")} onClick={() => askDelete(row)}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    )
  }

  return (
    <PageShell
      title={t("blog_posts_title")}
      description={t("blog_posts_subtitle")}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={status === "trash" ? "default" : "outline"} onClick={() => { setStatus((s) => (s === "trash" ? "" : "trash")); setPage(1) }}>
            {status === "trash" ? t("show_active") : t("show_trash")}
          </Button>
          <Button asChild>
            <Link href="/dashboard/blog/new">{t("add_post")}</Link>
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
          ]}
        />
      ) : null}

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
          <p className="text-muted-foreground p-4 text-sm">{tUi("empty")}</p>
        ) : (
          <>
            <div className="space-y-2 md:hidden">
              {items.map((row) => (
                <MobileListCard
                  key={row.id}
                  media={
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/dashboard/blog/posts/${row.id}`} className="font-medium hover:underline">
                        {row.title}
                      </Link>
                      <Badge variant={statusBadgeVariant(row.status)}>{enumLabel("post_status", row.status)}</Badge>
                    </div>
                  }
                  actions={rowActions(row)}
                >
                  <MobileListField label={t("categories")}>{row.category?.name ?? "—"}</MobileListField>
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
                    <th className="p-3 text-start font-medium">{t("categories")}</th>
                    <th className="p-3 text-start font-medium">{t("col_status")}</th>
                    <th className="p-3 text-start font-medium">{t("col_date")}</th>
                    <th className="p-3 text-start font-medium">{t("seo")}</th>
                    <th className="p-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="p-3">
                        <Link href={`/dashboard/blog/posts/${row.id}`} className="font-medium hover:underline">
                          {row.title}
                        </Link>
                      </td>
                      <td className="text-muted-foreground p-3">{row.category?.name ?? "—"}</td>
                      <td className="p-3">
                        <Badge variant={statusBadgeVariant(row.status)}>{enumLabel("post_status", row.status)}</Badge>
                      </td>
                      <td className="text-muted-foreground p-3 text-xs">{formatDisplayDate(row.date, locale)}</td>
                      <td className="p-3">
                        <SeoKeywordIndicator seo={row.seo} title={row.title} excerpt={row.excerpt} />
                      </td>
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
