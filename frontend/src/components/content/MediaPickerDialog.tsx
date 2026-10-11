"use client"

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useId, useMemo, useState } from "react"

import { PostsPagination } from "@/components/PostsPagination"
import { QueryErrorState } from "@/components/QueryErrorState"
import { MediaDropzone } from "@/components/media/MediaDropzone"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { MEDIA_TERM_ALL, MediaTermTreeSelect } from "@/components/media/MediaTermTreeSelect"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { resolveMediaAlt, type MediaAltFields } from "@/lib/media-alt"

export type MediaPickerAccept = "image" | "video" | "all"

type MediaItem = MediaAltFields & {
  id: number
  url?: string | null
  mime?: string | null
  title?: string | null
  alt?: string | null
}
type Term = { id: number; name: string; parent?: number | null }
type TermsPayload = { folders?: Term[]; categories?: Term[] }
type ListPayload = { items: MediaItem[]; total?: number; per_page?: number }

const PER_PAGE = 24

function mimeQuery(accept: MediaPickerAccept): string | undefined {
  if (accept === "image") return "image"
  if (accept === "video") return "video"
  return undefined
}

function dropzoneAccept(accept: MediaPickerAccept): string {
  if (accept === "image") return "image/*"
  if (accept === "video") return "video/*"
  return "image/*,video/*"
}

function matchesAccept(mime: string | null | undefined, accept: MediaPickerAccept): boolean {
  if (!mime) return accept === "all"
  if (accept === "image") return mime.startsWith("image/")
  if (accept === "video") return mime.startsWith("video/")
  return mime.startsWith("image/") || mime.startsWith("video/")
}

export function MediaPickerDialog({
  open,
  onOpenChange,
  onPick,
  title,
  accept = "image",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (item: { id: number; url: string; alt?: string | null; mime?: string | null }) => void
  title?: string
  accept?: MediaPickerAccept
}) {
  const t = useTranslations("ui")
  const id = useId()
  const qc = useQueryClient()
  const [folder, setFolder] = useState(MEDIA_TERM_ALL)
  const [category, setCategory] = useState(MEDIA_TERM_ALL)
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    setPage(1)
  }, [accept])

  const termsQ = useQuery({
    queryKey: ["media", "terms"],
    enabled: open,
    queryFn: () => api<TermsPayload>("/api/v1/media/terms"),
  })

  const listQ = useQuery({
    queryKey: ["media", "picker", accept, search, folder, category, page],
    enabled: open,
    placeholderData: keepPreviousData,
    queryFn: () => {
      const p = new URLSearchParams({ per_page: String(PER_PAGE), page: String(page) })
      const mime = mimeQuery(accept)
      if (mime) p.set("mime", mime)
      if (search) p.set("search", search)
      if (folder !== MEDIA_TERM_ALL) p.set("folder_id", folder)
      if (category !== MEDIA_TERM_ALL) p.set("category_id", category)
      return api<ListPayload>(`/api/v1/media?${p}`)
    },
  })

  const items = useMemo(
    () => (listQ.data?.items ?? []).filter((i) => i.url && matchesAccept(i.mime, accept)),
    [listQ.data?.items, accept],
  )
  const folders = termsQ.data?.folders ?? []
  const categories = termsQ.data?.categories ?? []

  async function uploadFiles(files: File[]) {
    setUploading(true)
    setUploadError(null)
    try {
      let last: MediaItem | null = null
      for (const file of files) {
        const body = new FormData()
        body.append("file", file)
        if (folder !== MEDIA_TERM_ALL) body.append("folder_id", folder)
        if (category !== MEDIA_TERM_ALL) body.append("category_ids", JSON.stringify([Number(category)]))
        last = await api<MediaItem>("/api/v1/media", { method: "POST", body })
      }
      await qc.invalidateQueries({ queryKey: ["media"] })
      if (last?.url && files.length === 1) {
        onPick({ id: last.id, url: last.url, alt: resolveMediaAlt(last), mime: last.mime })
        onOpenChange(false)
      } else {
        setPage(1)
        void listQ.refetch()
      }
    } catch (e) {
      setUploadError(getApiErrorMessage(e as Error))
    } finally {
      setUploading(false)
    }
  }

  const dialogTitle =
    title ??
    (accept === "video" ? t("media_pick_video_title") : accept === "all" ? t("media_pick_any_title") : t("media_pick_title"))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>

        <MediaDropzone
          multiple={false}
          busy={uploading}
          accept={dropzoneAccept(accept)}
          onFiles={(files) => void uploadFiles(files)}
          emptyLabel={t("media_dropzone")}
          className="min-h-24"
        />
        {uploadError ? <p className="text-destructive text-sm">{uploadError}</p> : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <MediaTermTreeSelect
            id={`${id}-folder`}
            terms={folders}
            value={folder}
            allLabel={t("media_all_folders")}
            label={t("media_folder")}
            onValueChange={(v) => {
              setFolder(v)
              setPage(1)
            }}
          />
          <MediaTermTreeSelect
            id={`${id}-category`}
            terms={categories}
            value={category}
            allLabel={t("media_all_categories")}
            label={t("media_category")}
            onValueChange={(v) => {
              setCategory(v)
              setPage(1)
            }}
          />
          <div className="space-y-1">
            <Label htmlFor={`${id}-search`}>{t("media_search_ph")}</Label>
            <Input
              id={`${id}-search`}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("media_search_ph")}
            />
          </div>
        </div>

        {listQ.isError ? (
          <QueryErrorState onRetry={() => listQ.refetch()} />
        ) : listQ.isPending ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-muted-foreground space-y-2 py-8 text-center text-sm">
            <p>{t("media_empty")}</p>
            <p>
              <Link href="/dashboard/media" className="text-primary underline-offset-4 hover:underline">
                {t("media_open_library")}
              </Link>
            </p>
          </div>
        ) : (
          <div className="grid max-h-[26rem] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-6">
            {items.map((item) => {
              const isVideo = Boolean(item.mime?.startsWith("video/"))
              return (
                <button
                  key={item.id}
                  type="button"
                  title={item.title || undefined}
                  className="hover:ring-primary focus-visible:ring-primary overflow-hidden rounded-lg border ring-offset-2 outline-none hover:ring-2 focus-visible:ring-2"
                  onClick={() => {
                    if (!item.url) return
                    onPick({ id: item.id, url: item.url, alt: resolveMediaAlt(item), mime: item.mime })
                    onOpenChange(false)
                  }}
                >
                  {isVideo ? (
                    <video
                      src={item.url!}
                      className="aspect-square w-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.url!}
                      alt={resolveMediaAlt(item) || item.title || ""}
                      className="aspect-square w-full object-cover"
                    />
                  )}
                </button>
              )
            })}
          </div>
        )}

        <PostsPagination
          page={page}
          perPage={listQ.data?.per_page ?? PER_PAGE}
          found={listQ.data?.total ?? 0}
          onPageChange={setPage}
          showPerPageSelector={false}
        />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("media_close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
