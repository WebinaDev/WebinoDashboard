"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { useConfirm } from "@/components/ConfirmDialog"
import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type Term = {
  id: number
  name: string
  slug: string
  parent?: number | null
  description?: string | null
  count?: number
}

type TermsPayload = { folders: Term[]; categories: Term[]; tags: Term[] }

export default function MediaTermsPage({
  route: _route,
  kind,
}: {
  route: ResolvedAdminRoute
  kind: "folder" | "category"
}) {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const t = useTranslations("media")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [parent, setParent] = useState("")
  const [description, setDescription] = useState("")

  const q = useQuery({
    queryKey: ["media", "terms"],
    queryFn: () => api<TermsPayload>("/api/v1/media/terms"),
  })

  const items = kind === "folder" ? (q.data?.folders ?? []) : (q.data?.categories ?? [])

  const createMut = useMutation({
    mutationFn: () =>
      api("/api/v1/media/terms", {
        method: "POST",
        json: {
          kind,
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
      void qc.invalidateQueries({ queryKey: ["media", "terms"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api(`/api/v1/media/terms/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t("deleted"))
      void qc.invalidateQueries({ queryKey: ["media", "terms"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  return (
    <PageShell
      title={kind === "folder" ? t("folders_title") : t("categories_title")}
      description={kind === "folder" ? t("folders_subtitle") : t("categories_subtitle")}
    >
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
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>{t("description")}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <Button type="submit" disabled={!name.trim() || createMut.isPending}>
            {t("add_term")}
          </Button>
        </form>

        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-muted-foreground text-xs">
                  {item.slug} · {item.count ?? 0}
                </p>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => confirm({ onConfirm: () => deleteMut.mutateAsync(item.id) })}>
                {t("delete")}
              </Button>
            </li>
          ))}
          {items.length === 0 ? <p className="text-muted-foreground text-sm">{tCommon("empty")}</p> : null}
        </ul>
      </div>
      {confirmDialog}
    </PageShell>
  )
}
