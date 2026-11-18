"use client"

/* Poetry taxonomy admin — occasions / figures / styles / meters, blog-categories UX. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { useConfirm } from "@/components/ConfirmDialog"
import { ListStatsStrip } from "@/components/ListStatsStrip"
import { PageShell } from "@/components/PageShell"
import { SimpleSeoFields, type SimpleSeo } from "@/components/seo/SimpleSeoFields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { slugifyTitle } from "@/lib/slugify"

import type { PoetryTerm, PoetryTermKind } from "./poetry-api"

const KINDS: PoetryTermKind[] = ["occasion", "figure", "style", "meter"]
const SEO_OPEN_KEY = "webina.seo.open.poetry-categories"

export default function PoetryCategoriesPage(_props: { route: ResolvedAdminRoute }) {
  const t = useTranslations("poetry_admin")
  const tCommon = useTranslations("common")
  const { confirm, dialog: confirmDialog } = useConfirm()
  const qc = useQueryClient()
  const [kind, setKind] = useState<PoetryTermKind>("occasion")
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugAuto, setSlugAuto] = useState(true)
  const [seo, setSeo] = useState<SimpleSeo>({})

  const q = useQuery({
    queryKey: ["poetry", "terms"],
    queryFn: async () => {
      const res = await api<{ data: PoetryTerm[] } | PoetryTerm[]>("/api/v1/poetry/terms")
      const rows = Array.isArray(res) ? res : Array.isArray((res as { data?: PoetryTerm[] }).data) ? (res as { data: PoetryTerm[] }).data : []
      return rows
    },
  })

  const items = (q.data ?? []).filter((x) => x.kind === kind)
  const stats = {
    total: (q.data ?? []).length,
    kind: items.length,
    withPoems: items.filter((x) => (x.poems_count ?? 0) > 0).length,
  }

  const createMut = useMutation({
    mutationFn: () => {
      const trimmedName = name.trim()
      const nextSlug = slug.trim() || slugifyTitle(trimmedName)
      return api("/api/v1/poetry/terms", {
        method: "POST",
        json: { kind, name: trimmedName, slug: nextSlug || undefined, seo },
      })
    },
    onSuccess: () => {
      toast.success(tCommon("saved"))
      setName("")
      setSlug("")
      setSeo({})
      setSlugAuto(true)
      void qc.invalidateQueries({ queryKey: ["poetry", "terms"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const renameMut = useMutation({
    mutationFn: ({ id, next }: { id: number; next: string }) =>
      api(`/api/v1/poetry/terms/${id}`, { method: "PUT", json: { name: next } }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["poetry", "terms"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api(`/api/v1/poetry/terms/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t("deleted"))
      void qc.invalidateQueries({ queryKey: ["poetry", "terms"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const kindLabel = (k: PoetryTermKind) => t(`kind_${k}` as "kind_occasion")

  return (
    <PageShell title={t("categories_title")} description={t("categories_subtitle")}>
      <ListStatsStrip
        className="mb-4"
        items={[
          { id: "total", label: t("stat_total"), value: stats.total },
          { id: "kind", label: kindLabel(kind), value: stats.kind },
          { id: "with", label: t("stat_with_poems"), value: stats.withPoems },
        ]}
      />

      <div className="mb-4 flex flex-wrap gap-1">
        {KINDS.map((k) => (
          <Button
            key={k}
            type="button"
            size="sm"
            variant={kind === k ? "default" : "outline"}
            onClick={() => setKind(k)}
          >
            {kindLabel(k)}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          className="space-y-3 rounded-xl border p-4"
          onSubmit={(e) => {
            e.preventDefault()
            void createMut.mutateAsync()
          }}
        >
          <p className="font-medium">{t("add_term")}</p>
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
              dir="ltr"
              value={slug}
              onChange={(e) => {
                setSlugAuto(false)
                setSlug(e.target.value)
              }}
            />
          </div>
          <SimpleSeoFields seo={seo} onChange={setSeo} collapsible storageKey={SEO_OPEN_KEY} defaultOpen={false} />
          <Button type="submit" disabled={!name.trim() || createMut.isPending}>
            {t("add_term")}
          </Button>
        </form>

        <ul className="space-y-2">
          {items.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-muted-foreground text-xs" dir="ltr">
                  {c.slug} · {c.poems_count ?? 0}
                  {c.seo?.focus_keyword ? ` · ${c.seo.focus_keyword}` : ""}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const next = window.prompt(t("rename_prompt"), c.name)
                    if (next && next.trim() && next.trim() !== c.name) {
                      void renameMut.mutateAsync({ id: c.id, next: next.trim() })
                    }
                  }}
                >
                  {t("edit")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => confirm({ description: c.name, onConfirm: () => deleteMut.mutateAsync(c.id) })}
                >
                  {t("delete")}
                </Button>
              </div>
            </li>
          ))}
          {items.length === 0 ? (
            <li className="text-muted-foreground rounded-lg border px-3 py-6 text-center text-sm">{t("empty_categories")}</li>
          ) : null}
        </ul>
      </div>
      {confirmDialog}
    </PageShell>
  )
}
