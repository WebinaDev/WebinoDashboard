"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Folder, Pencil, Tags, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
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
import { useConfirm } from "@/components/ConfirmDialog"
import { MEDIA_TERM_ALL, MediaTermTreeSelect } from "@/components/media/MediaTermTreeSelect"
import { PostsPagination, MEDIA_PER_PAGE_OPTIONS } from "@/components/PostsPagination"
import { mediaAltPatch, resolveMediaAlt, type MediaAltFields } from "@/lib/media-alt"
import { QueryErrorState } from "@/components/QueryErrorState"
import { TableListSkeleton } from "@/components/TableListSkeleton"

type Term = { id: number; name: string; slug: string; parent?: number | null; count?: number }
type MediaItem = MediaAltFields & {
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
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [folderId, setFolderId] = useState(MEDIA_TERM_ALL)
  const [categoryId, setCategoryId] = useState(MEDIA_TERM_ALL)
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const listQ = useQuery({
    queryKey: ["media", "list", page, perPage, search, folderId, categoryId],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), per_page: String(perPage) })
      if (search) p.set("search", search)
      if (folderId && folderId !== MEDIA_TERM_ALL) p.set("folder_id", folderId)
      if (categoryId && categoryId !== MEDIA_TERM_ALL) p.set("category_id", categoryId)
      return api<ListPayload>(`/api/v1/media?${p}`)
    },
  })

  const items = listQ.data?.items ?? []
  const total = listQ.data?.total ?? 0
  const folders = termsQ.data?.folders ?? []
  const categories = termsQ.data?.categories ?? []
  const tags = termsQ.data?.tags ?? []

  async function uploadFiles(files: File[]) {
    setBusy(true)
    try {
      for (const file of files) {
        const body = new FormData()
        body.append("file", file)
        if (folderId && folderId !== MEDIA_TERM_ALL) body.append("folder_id", folderId)
        if (categoryId && categoryId !== MEDIA_TERM_ALL) body.append("category_ids", JSON.stringify([Number(categoryId)]))
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
      alt: resolveMediaAlt(editItem),
      caption: editItem.caption ?? "",
      description: editItem.description ?? "",
    }
  }, [editItem])

  const [editDraft, setEditDraft] = useState(editForm)
  useEffect(() => {
    setEditDraft(editForm)
  }, [editForm])

  return (
    <PageShell title={t("title")} description={t("subtitle")}>
      <MediaDropzone busy={busy} onFiles={(files) => void uploadFiles(files)} emptyLabel={t("dropzone")} className="mb-4" />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t("search")}
        />
        <MediaTermTreeSelect
          terms={folders}
          value={folderId}
          allLabel={t("all_folders")}
          label={t("folder")}
          onValueChange={(v) => {
            setFolderId(v)
            setPage(1)
          }}
        />
        <MediaTermTreeSelect
          terms={categories}
          value={categoryId}
          allLabel={t("all_categories")}
          label={t("categories_short")}
          onValueChange={(v) => {
            setCategoryId(v)
            setPage(1)
          }}
        />
      </div>

      {listQ.isError ? (
        <QueryErrorState onRetry={() => listQ.refetch()} />
      ) : listQ.isLoading ? (
        <TableListSkeleton rows={4} columns={4} />
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 rounded-xl border p-3 text-sm">
              {item.url && item.mime?.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt={resolveMediaAlt(item)} className="bg-muted h-36 w-full rounded-lg object-cover" />
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
                  onClick={() => setEditItem(item)}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() =>
                    confirm({
                      description: item.title || item.original_name || undefined,
                      onConfirm: () => deleteMut.mutateAsync(item.id),
                    })
                  }
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <PostsPagination
        className="mt-4"
        page={page}
        perPage={perPage}
        found={total}
        onPageChange={setPage}
        onPerPageChange={(n) => {
          setPerPage(n)
          setPage(1)
        }}
        perPageOptions={MEDIA_PER_PAGE_OPTIONS}
      />
      {confirmDialog}

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
          if (!o) setEditItem(null)
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
                  <Label>{key === "title" ? t("meta_title") : key === "alt" ? t("alt") : t(key)}</Label>
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
                void patchMut.mutateAsync({
                  id: editItem.id,
                  json: {
                    title: editDraft.title,
                    slug: editDraft.slug,
                    caption: editDraft.caption,
                    description: editDraft.description,
                    ...mediaAltPatch(editDraft.alt),
                  },
                })
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
