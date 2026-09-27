"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { useConfirm } from "@/components/ConfirmDialog"
import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { buildTermTreeOptions, indentTermLabel } from "@/lib/term-tree"

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
  const [editTerm, setEditTerm] = useState<Term | null>(null)
  const [editDraft, setEditDraft] = useState({ name: "", slug: "", parent: "", description: "" })

  const q = useQuery({
    queryKey: ["media", "terms"],
    queryFn: () => api<TermsPayload>("/api/v1/media/terms"),
  })

  const items = kind === "folder" ? (q.data?.folders ?? []) : (q.data?.categories ?? [])
  const treeRows = useMemo(() => buildTermTreeOptions(items), [items])

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

  const updateMut = useMutation({
    mutationFn: () => {
      if (!editTerm) throw new Error("missing term")
      return api(`/api/v1/media/terms/${editTerm.id}`, {
        method: "PATCH",
        json: {
          name: editDraft.name,
          slug: editDraft.slug || undefined,
          parent: editDraft.parent ? Number(editDraft.parent) : null,
          description: editDraft.description || null,
        },
      })
    },
    onSuccess: () => {
      toast.success(tCommon("saved"))
      setEditTerm(null)
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

  function openEdit(term: Term) {
    setEditTerm(term)
    setEditDraft({
      name: term.name,
      slug: term.slug,
      parent: term.parent ? String(term.parent) : "",
      description: term.description ?? "",
    })
  }

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

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
              {treeRows.map((row) => (
                <option key={row.id} value={row.id}>
                  {indentTermLabel(row.label, row.depth)}
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
          {treeRows.map((row) => {
            const item = itemById.get(row.id)
            if (!item) return null
            return (
              <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{indentTermLabel(item.name, row.depth)}</p>
                  <p className="text-muted-foreground text-xs">
                    {item.slug} · {item.count ?? 0}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(item)}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      confirm({
                        description: item.name,
                        onConfirm: () => deleteMut.mutateAsync(item.id),
                      })
                    }
                  >
                    {t("delete")}
                  </Button>
                </div>
              </li>
            )
          })}
          {items.length === 0 ? <p className="text-muted-foreground text-sm">{tCommon("empty")}</p> : null}
        </ul>
      </div>

      <Dialog open={!!editTerm} onOpenChange={(o) => !o && setEditTerm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("edit_term")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("name")}</Label>
              <Input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>{t("slug")}</Label>
              <Input value={editDraft.slug} onChange={(e) => setEditDraft({ ...editDraft, slug: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>{t("parent")}</Label>
              <select
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                value={editDraft.parent}
                onChange={(e) => setEditDraft({ ...editDraft, parent: e.target.value })}
              >
                <option value="">{t("no_parent")}</option>
                {treeRows
                  .filter((row) => row.id !== editTerm?.id)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {indentTermLabel(row.label, row.depth)}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>{t("description")}</Label>
              <Input
                value={editDraft.description}
                onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => void updateMut.mutateAsync()} disabled={!editDraft.name.trim() || updateMut.isPending}>
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </PageShell>
  )
}
