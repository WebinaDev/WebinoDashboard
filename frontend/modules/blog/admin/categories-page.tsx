"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { useConfirm } from "@/components/ConfirmDialog"
import { SimpleSeoFields } from "@/components/seo/SimpleSeoFields"
import { ListStatsStrip } from "@/components/ListStatsStrip"
import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { slugifyTitle } from "@/lib/slugify"

type Cat = { id: number; name: string; slug: string; count?: number; seo?: { focus_keyword?: string } }

export default function BlogCategoriesPage(_props: { route: ResolvedAdminRoute }) {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const t = useTranslations("content_admin")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugAuto, setSlugAuto] = useState(true)
  const [seo, setSeo] = useState<{ title?: string; description?: string; focus_keyword?: string }>({})
  const [status, setStatus] = useState("")

  const q = useQuery({
    queryKey: ["blog", "categories", status],
    queryFn: () =>
      api<{ items: Cat[]; stats: { total: number; with_posts: number } }>(
        `/api/v1/blog/categories${status ? `?status=${status}` : ""}`,
      ),
  })

  const createMut = useMutation({
    mutationFn: () =>
      api("/api/v1/blog/categories", {
        method: "POST",
        json: { name, slug: slug || undefined, seo },
      }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      setName("")
      setSlug("")
      setSeo({})
      setSlugAuto(true)
      void qc.invalidateQueries({ queryKey: ["blog", "categories"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api(`/api/v1/blog/categories/${id}${status === "trash" ? "?force=1" : ""}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t("deleted"))
      void qc.invalidateQueries({ queryKey: ["blog", "categories"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const items = q.data?.items ?? []
  const stats = q.data?.stats

  return (
    <PageShell
      title={t("blog_categories_title")}
      description={t("blog_categories_subtitle")}
      actions={
        <Button type="button" variant={status === "trash" ? "default" : "outline"} onClick={() => setStatus((s) => (s === "trash" ? "" : "trash"))}>
          {status === "trash" ? t("show_active") : t("show_trash")}
        </Button>
      }
    >
      {stats ? (
        <ListStatsStrip
          className="mb-4"
          items={[
            { id: "total", label: t("stat_total"), value: stats.total },
            { id: "with", label: t("stat_with_posts"), value: stats.with_posts },
          ]}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          className="space-y-3 rounded-xl border p-4"
          onSubmit={(e) => {
            e.preventDefault()
            void createMut.mutateAsync()
          }}
        >
          <p className="font-medium">{t("add_category")}</p>
          <div className="space-y-1">
            <Label>{t("name")}</Label>
            <Input
              value={name}
              onChange={(e) => {
                const next = e.target.value
                setName(next)
                if (slugAuto) setSlug(slugifyTitle(next))
              }}
              required
            />
          </div>
          <div className="space-y-1">
            <Label>{t("slug")}</Label>
            <Input
              value={slug}
              onChange={(e) => {
                setSlugAuto(false)
                setSlug(e.target.value)
              }}
            />
          </div>
          <SimpleSeoFields seo={seo} onChange={setSeo} className="border-0 p-0 shadow-none" />
          <Button type="submit" disabled={!name.trim() || createMut.isPending}>
            {t("add_category")}
          </Button>
        </form>

        <ul className="space-y-2">
          {items.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-muted-foreground text-xs">
                  {c.slug} · {c.count ?? 0}
                  {c.seo?.focus_keyword ? ` · ${c.seo.focus_keyword}` : ""}
                </p>
              </div>
              <div className="flex gap-1">
                {status === "trash" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      api(`/api/v1/blog/categories/${c.id}/restore`, { method: "POST" }).then(() => {
                        toast.success(tCommon("saved"))
                        void qc.invalidateQueries({ queryKey: ["blog", "categories"] })
                      })
                    }
                  >
                    {t("restore")}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => confirm({ description: c.name, onConfirm: () => deleteMut.mutateAsync(c.id) })}
                >
                  {status === "trash" ? t("permanent_delete") : t("delete")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {confirmDialog}
    </PageShell>
  )
}
