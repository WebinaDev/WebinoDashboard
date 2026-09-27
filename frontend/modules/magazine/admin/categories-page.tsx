"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { useConfirm } from "@/components/ConfirmDialog"
import { ListStatsStrip } from "@/components/ListStatsStrip"
import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type Cat = {
  id: number
  name: string
  slug: string
  parent?: number | null
  description?: string | null
  count?: number
}

export default function MagazineCategoriesPage(_props: { route: ResolvedAdminRoute }) {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const t = useTranslations("content_admin")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [parent, setParent] = useState("")
  const [description, setDescription] = useState("")

  const q = useQuery({
    queryKey: ["magazine", "categories"],
    queryFn: () =>
      api<{ items: Cat[]; stats: { total: number; with_posts: number; empty: number } }>(
        "/api/v1/magazine/categories",
      ),
  })

  const createMut = useMutation({
    mutationFn: () =>
      api("/api/v1/magazine/categories", {
        method: "POST",
        json: {
          name,
          slug: slug || undefined,
          parent: parent ? Number(parent) : null,
          description: description || null,
        },
      }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      setName("")
      setSlug("")
      setParent("")
      setDescription("")
      void qc.invalidateQueries({ queryKey: ["magazine", "categories"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api(`/api/v1/magazine/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["magazine", "categories"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const items = q.data?.items ?? []
  const stats = q.data?.stats

  return (
    <PageShell title={t("categories_title")} description={t("categories_subtitle")}>
      {stats ? (
        <ListStatsStrip
          className="mb-4"
          items={[
            { id: "total", label: t("stat_total"), value: stats.total },
            { id: "with", label: t("stat_with_posts"), value: stats.with_posts },
            { id: "empty", label: t("stat_empty"), value: stats.empty },
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
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label>{t("slug")}</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("parent")}</Label>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              value={parent}
              onChange={(e) => setParent(e.target.value)}
            >
              <option value="">{t("no_parent")}</option>
              {items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>{t("description")}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
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
                </p>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => confirm({ onConfirm: () => deleteMut.mutateAsync(c.id) })}>
                {t("delete")}
              </Button>
            </li>
          ))}
        </ul>
      </div>
      {confirmDialog}
    </PageShell>
  )
}
