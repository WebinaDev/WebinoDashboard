"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useId, useState } from "react"

import { PostsPagination } from "@/components/PostsPagination"
import { QueryErrorState } from "@/components/QueryErrorState"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"

type MediaItem = { id: number; url?: string | null; mime?: string | null; title?: string | null; alt?: string | null }
type Term = { id: number; name: string }
type TermsPayload = { folders?: Term[]; categories?: Term[] }
type ListPayload = { items: MediaItem[]; total?: number; per_page?: number }

const PER_PAGE = 24
const ALL = "0"

export function MediaPickerDialog({
  open,
  onOpenChange,
  onPick,
  title,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (item: { id: number; url: string; alt?: string | null }) => void
  title?: string
}) {
  const t = useTranslations("ui")
  const id = useId()
  const [folder, setFolder] = useState(ALL)
  const [category, setCategory] = useState(ALL)
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const termsQ = useQuery({
    queryKey: ["media", "terms"],
    enabled: open,
    queryFn: () => api<TermsPayload>("/api/v1/media/terms"),
  })

  const listQ = useQuery({
    queryKey: ["media", "picker", search, folder, category, page],
    enabled: open,
    placeholderData: keepPreviousData,
    queryFn: () => {
      const p = new URLSearchParams({ per_page: String(PER_PAGE), page: String(page), mime: "image" })
      if (search) p.set("search", search)
      if (folder !== ALL) p.set("folder_id", folder)
      if (category !== ALL) p.set("category_id", category)
      return api<ListPayload>(`/api/v1/media?${p}`)
    },
  })

  const items = (listQ.data?.items ?? []).filter((i) => i.url && (!i.mime || i.mime.startsWith("image/")))
  const folders = termsQ.data?.folders ?? []
  const categories = termsQ.data?.categories ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title ?? t("media_pick_title")}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor={`${id}-folder`}>{t("media_folder")}</Label>
            <Select
              value={folder}
              onValueChange={(v) => {
                setFolder(v)
                setPage(1)
              }}
            >
              <SelectTrigger id={`${id}-folder`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("media_all_folders")}</SelectItem>
                {folders.map((f) => (
                  <SelectItem key={f.id} value={String(f.id)}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-category`}>{t("media_category")}</Label>
            <Select
              value={category}
              onValueChange={(v) => {
                setCategory(v)
                setPage(1)
              }}
            >
              <SelectTrigger id={`${id}-category`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("media_all_categories")}</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
              {t("media_upload_hint")}{" "}
              <Link href="/dashboard/media" className="text-primary underline-offset-4 hover:underline">
                {t("media_open_library")}
              </Link>
            </p>
          </div>
        ) : (
          <div className="grid max-h-[26rem] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-6">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.title || undefined}
                className="hover:ring-primary focus-visible:ring-primary overflow-hidden rounded-lg border ring-offset-2 outline-none hover:ring-2 focus-visible:ring-2"
                onClick={() => {
                  if (!item.url) return
                  onPick({ id: item.id, url: item.url, alt: item.alt })
                  onOpenChange(false)
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url!} alt={item.alt || item.title || ""} className="aspect-square w-full object-cover" />
              </button>
            ))}
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
