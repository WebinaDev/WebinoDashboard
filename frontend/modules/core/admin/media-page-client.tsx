"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Folder, Pencil, Tags, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { MediaDropzone } from "@/components/media/MediaDropzone"
import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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

type Term = { id: number; name: string; slug: string; parent?: number | null; count?: number }
type MediaItem = {
  id: number
  url?: string | null
  mime?: string | null
  title?: string | null
  alt?: string | null
  slug?: string | null
  caption?: string | null
  description?: string | null
  original_name?: string | null
  folder_id?: number | null
  category_ids?: number[]
  tag_ids?: number[]
  tags?: { id: number; name: string }[]
}

type TermsPayload = { folders: Term[]; categories: Term[]; tags: Term[] }
type ListPayload = { items: MediaItem[]; page: number; total: number; per_page: number }

export default function MediaPageClient(_props: { route: ResolvedAdminRoute }) {
  const t = useTranslations("media")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")
  const [folderId, setFolderId] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [busy, setBusy] = useState(false)
  const [editItem, setEditItem] = useState<MediaItem | null>(null)
  const [folderItem, setFolderItem] = useState<MediaItem | null>(null)
  const [catsItem, setCatsItem] = useState<MediaItem | null>(null)
  const [tagsItem, setTagsItem] = useState<MediaItem | null>(null)
  const [tagDraft, setTagDraft] = useState("")

  const termsQ = useQuery({
    queryKey: ["media", "terms"],
    queryFn: () => api<TermsPayload>("/api/v1/media/terms"),
  })

  const listQ = useQuery({
    queryKey: ["media", "list", page, appliedSearch, folderId, categoryId],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), per_page: "24" })
      if (appliedSearch.trim()) p.set("search", appliedSearch.trim())
      if (folderId) p.set("folder_id", folderId)
      if (categoryId) p.set("category_id", categoryId)
      return api<ListPayload>(`/api/v1/media?${p}`)
    },
  })

  const items = listQ.data?.items ?? []
  const total = listQ.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 24))
  const folders = termsQ.data?.folders ?? []
  const categories = termsQ.data?.categories ?? []
  const tags = termsQ.data?.tags ?? []

  async function uploadFiles(files: File[]) {
    setBusy(true)
    try {
      for (const file of files) {
        const body = new FormData()
        body.append("file", file)
        if (folderId) body.append("folder_id", folderId)
        if (categoryId) body.append("category_ids", JSON.stringify([Number(categoryId)]))
        await api("/api/v1/media", { method: "POST", body })
      }
      toast.success(t("uploaded"))
      void qc.invalidateQueries({ queryKey: ["media"] })
    } catch (e) {
      toast.error(getApiErrorMessage(e as Error))
    } finally {
      setBusy(false)
    }
  }

  const patchMut = useMutation({
    mutationFn: ({ id, json }: { id: number; json: Record<string, unknown> }) =>
      api(`/api/v1/media/${id}`, { method: "PATCH", json }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["media"] })
      setEditItem(null)
      setFolderItem(null)
      setCatsItem(null)
      setTagsItem(null)
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api(`/api/v1/media/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t("deleted"))
      void qc.invalidateQueries({ queryKey: ["media"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const editForm = useMemo(() => {
    if (!editItem) return null
    return {
      title: editItem.title ?? "",
      slug: editItem.slug ?? "",
      alt: editItem.alt ?? "",
      caption: editItem.caption ?? "",
      description: editItem.description ?? "",
    }
  }, [editItem])

  const [editDraft, setEditDraft] = useState(editForm)
  if (editItem && editDraft === null && editForm) {
    setEditDraft(editForm)
  }

  return (
    <PageShell title={t("title")} description={t("subtitle")}>
      <MediaDropzone busy={busy} onFiles={(files) => void uploadFiles(files)} emptyLabel={t("dropzone")} className="mb-4" />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search")}
        />
        <select
          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          value={folderId}
          onChange={(e) => {
            setFolderId(e.target.value)
            setPage(1)
          }}
        >
          <option value="">{t("all_folders")}</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <select
          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value)
            setPage(1)
          }}
        >
          <option value="">{t("all_categories")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setAppliedSearch(search)
            setPage(1)
          }}
        >
          {t("apply_filters")}
        </Button>
      </div>

      {listQ.isLoading ? (
        <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 rounded-xl border p-3 text-sm">
              {item.url && item.mime?.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt={item.alt || ""} className="bg-muted h-36 w-full rounded-lg object-cover" />
              ) : (
                <div className="bg-muted text-muted-foreground flex h-36 items-center justify-center rounded-lg text-xs">
                  {item.mime || t("file")}
                </div>
              )}
              <p className="truncate font-medium">{item.title || item.original_name}</p>
              <div className="flex flex-wrap gap-1">
                <Button type="button" size="sm" variant="ghost" onClick={() => setFolderItem(item)}>
                  <Folder className="size-3.5" />
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setCatsItem(item)}>
                  {t("categories_short")}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setTagsItem(item); setTagDraft("") }}>
                  <Tags className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditItem(item)
                    setEditDraft({
                      title: item.title ?? "",
                      slug: item.slug ?? "",
                      alt: item.alt ?? "",
                      caption: item.caption ?? "",
                      description: item.description ?? "",
                    })
                  }}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => void deleteMut.mutateAsync(item.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between">
          <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {tCommon("prev")}
          </Button>
          <span className="text-muted-foreground text-sm">
            {page} / {totalPages}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {tCommon("next")}
          </Button>
        </div>
      ) : null}

      <Dialog open={!!folderItem} onOpenChange={(o) => !o && setFolderItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("assign_folder")}</DialogTitle>
          </DialogHeader>
          <select
            className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
            defaultValue={folderItem?.folder_id ?? ""}
            id="media-folder-select"
          >
            <option value="">{t("no_folder")}</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                if (!folderItem) return
                const el = document.getElementById("media-folder-select") as HTMLSelectElement | null
                const val = el?.value ?? ""
                void patchMut.mutateAsync({
                  id: folderItem.id,
                  json: { folder_id: val ? Number(val) : null },
                })
              }}
            >
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!catsItem} onOpenChange={(o) => !o && setCatsItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("assign_categories")}</DialogTitle>
          </DialogHeader>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {categories.map((c) => {
              const checked = catsItem?.category_ids?.includes(c.id)
              return (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={!!checked}
                    onCheckedChange={(v) => {
                      if (!catsItem) return
                      const set = new Set(catsItem.category_ids ?? [])
                      if (v) set.add(c.id)
                      else set.delete(c.id)
                      setCatsItem({ ...catsItem, category_ids: [...set] })
                    }}
                  />
                  {c.name}
                </label>
              )
            })}
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                if (!catsItem) return
                void patchMut.mutateAsync({
                  id: catsItem.id,
                  json: { category_ids: catsItem.category_ids ?? [] },
                })
              }}
            >
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!tagsItem} onOpenChange={(o) => !o && setTagsItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("assign_tags")}</DialogTitle>
          </DialogHeader>
          <div className="mb-2 flex flex-wrap gap-1">
            {(tagsItem?.tag_ids ?? []).map((id) => {
              const tag = tags.find((x) => x.id === id)
              return (
                <button
                  key={id}
                  type="button"
                  className="bg-muted rounded-full px-2 py-0.5 text-xs"
                  onClick={() =>
                    setTagsItem((prev) =>
                      prev ? { ...prev, tag_ids: (prev.tag_ids ?? []).filter((x) => x !== id) } : prev,
                    )
                  }
                >
                  {tag?.name ?? id} ×
                </button>
              )
            })}
          </div>
          <div className="flex gap-2">
            <Input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} placeholder={t("new_tag")} />
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                if (!tagDraft.trim() || !tagsItem) return
                const created = await api<Term>("/api/v1/media/terms", {
                  method: "POST",
                  json: { kind: "tag", name: tagDraft.trim() },
                })
                setTagsItem({
                  ...tagsItem,
                  tag_ids: [...new Set([...(tagsItem.tag_ids ?? []), created.id])],
                })
                setTagDraft("")
                void qc.invalidateQueries({ queryKey: ["media", "terms"] })
              }}
            >
              +
            </Button>
          </div>
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className="hover:bg-muted block w-full rounded px-2 py-1 text-start text-sm"
                onClick={() =>
                  setTagsItem((prev) => {
                    if (!prev) return prev
                    const set = new Set(prev.tag_ids ?? [])
                    if (set.has(tag.id)) set.delete(tag.id)
                    else set.add(tag.id)
                    return { ...prev, tag_ids: [...set] }
                  })
                }
              >
                {tag.name}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                if (!tagsItem) return
                void patchMut.mutateAsync({ id: tagsItem.id, json: { tag_ids: tagsItem.tag_ids ?? [] } })
              }}
            >
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editItem}
        onOpenChange={(o) => {
          if (!o) {
            setEditItem(null)
            setEditDraft(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("edit_meta")}</DialogTitle>
          </DialogHeader>
          {editDraft ? (
            <div className="space-y-3">
              {(["title", "slug", "alt", "caption", "description"] as const).map((key) => (
                <div key={key} className="space-y-1">
                  <Label>{key === "title" ? t("meta_title") : t(key)}</Label>
                  <Input
                    value={editDraft[key]}
                    onChange={(e) => setEditDraft({ ...editDraft, [key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                if (!editItem || !editDraft) return
                void patchMut.mutateAsync({ id: editItem.id, json: editDraft })
              }}
            >
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
