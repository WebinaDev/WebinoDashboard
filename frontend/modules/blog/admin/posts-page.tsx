"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { ListStatsStrip } from "@/components/ListStatsStrip"
import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type PostRow = {
  id: number
  title: string
  status: string
  date?: string
  excerpt?: string
  category?: { id: number; name: string } | null
}
type ListPayload = {
  items: PostRow[]
  found: number
  page: number
  stats: { total: number; publish: number; draft: number; pending: number }
}

export default function BlogPostsPage(_props: { route: ResolvedAdminRoute }) {
  const t = useTranslations("content_admin")
  const tSite = useTranslations("site_admin")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()

  const q = useQuery({
    queryKey: ["blog", "posts"],
    queryFn: () => api<ListPayload>("/api/v1/blog/posts?per_page=50"),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api(`/api/v1/blog/posts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["blog", "posts"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const stats = q.data?.stats
  const items = q.data?.items ?? []

  return (
    <PageShell
      title={tSite("blog_title")}
      description={t("posts_subtitle")}
      actions={
        <Button asChild>
          <Link href="/dashboard/blog/new">{t("add_post")}</Link>
        </Button>
      }
    >
      {stats ? (
        <ListStatsStrip
          className="mb-4"
          items={[
            { id: "total", label: t("stat_total"), value: stats.total },
            { id: "publish", label: t("stat_publish"), value: stats.publish },
            { id: "draft", label: t("stat_draft"), value: stats.draft },
          ]}
        />
      ) : null}

      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-start">
            <tr>
              <th className="p-3 font-medium">{t("col_title")}</th>
              <th className="p-3 font-medium">{t("categories")}</th>
              <th className="p-3 font-medium">{t("col_status")}</th>
              <th className="p-3 font-medium">{t("col_date")}</th>
              <th className="p-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-3">
                  <Link href={`/dashboard/blog/posts/${row.id}`} className="font-medium hover:underline">
                    {row.title}
                  </Link>
                </td>
                <td className="text-muted-foreground p-3">{row.category?.name ?? "—"}</td>
                <td className="p-3">{row.status}</td>
                <td className="text-muted-foreground p-3 text-xs">{row.date}</td>
                <td className="p-3 text-end">
                  <Button type="button" size="sm" variant="ghost" onClick={() => void deleteMut.mutateAsync(row.id)}>
                    {t("delete")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 ? <p className="text-muted-foreground p-6 text-sm">{tCommon("empty")}</p> : null}
      </div>
    </PageShell>
  )
}
