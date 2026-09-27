"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Fragment, useState } from "react"
import { toast } from "sonner"

import { ListStatsStrip } from "@/components/ListStatsStrip"
import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type PageRow = {
  id: number
  title: string
  status: string
  date?: string
  parent?: number | null
  slug: string
}

type ListPayload = {
  items: PageRow[]
  found: number
  stats: { total: number; publish: number; draft: number; pending: number }
}

export default function CmsPagesListPage(_props: { route: ResolvedAdminRoute }) {
  const t = useTranslations("content_admin")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [quickId, setQuickId] = useState<number | null>(null)
  const [quickTitle, setQuickTitle] = useState("")
  const [quickStatus, setQuickStatus] = useState("draft")
  const [quickParent, setQuickParent] = useState("")

  const q = useQuery({
    queryKey: ["cms", "pages"],
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
    mutationFn: (id: number) => api(`/api/v1/cms/pages/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["cms", "pages"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const items = q.data?.items ?? []
  const stats = q.data?.stats

  return (
    <PageShell
      title={t("pages_title")}
      description={t("pages_subtitle")}
      actions={
        <Button asChild>
          <Link href="/dashboard/pages/new">{t("add_page")}</Link>
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
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="p-3 text-start font-medium">{t("col_title")}</th>
              <th className="p-3 text-start font-medium">{t("col_status")}</th>
              <th className="p-3 text-start font-medium">{t("col_date")}</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <Fragment key={row.id}>
                <tr className="border-t">
                  <td className="p-3">
                    <Link href={`/dashboard/pages/${row.id}`} className="font-medium hover:underline">
                      {row.title}
                    </Link>
                    <p className="text-muted-foreground text-xs">{row.slug}</p>
                  </td>
                  <td className="p-3">{row.status}</td>
                  <td className="text-muted-foreground p-3 text-xs">{row.date}</td>
                  <td className="space-x-1 p-3 text-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setQuickId(row.id)
                        setQuickTitle(row.title)
                        setQuickStatus(row.status)
                        setQuickParent(row.parent ? String(row.parent) : "")
                      }}
                    >
                      {t("quick_edit")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => void deleteMut.mutateAsync(row.id)}>
                      {t("delete")}
                    </Button>
                  </td>
                </tr>
                {quickId === row.id ? (
                  <tr className="bg-muted/20 border-t">
                    <td colSpan={4} className="space-y-2 p-3">
                      <div className="flex flex-wrap gap-2">
                        <Input className="max-w-xs" value={quickTitle} onChange={(e) => setQuickTitle(e.target.value)} />
                        <select
                          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                          value={quickStatus}
                          onChange={(e) => setQuickStatus(e.target.value)}
                        >
                          <option value="draft">{t("stat_draft")}</option>
                          <option value="pending">{t("stat_pending")}</option>
                          <option value="published">{t("stat_publish")}</option>
                        </select>
                        <select
                          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                          value={quickParent}
                          onChange={(e) => setQuickParent(e.target.value)}
                        >
                          <option value="">{t("no_parent")}</option>
                          {items
                            .filter((p) => p.id !== row.id)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.title}
                              </option>
                            ))}
                        </select>
                        <Button
                          type="button"
                          size="sm"
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
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
        {items.length === 0 ? <p className="text-muted-foreground p-6 text-sm">{tCommon("empty")}</p> : null}
      </div>
    </PageShell>
  )
}
