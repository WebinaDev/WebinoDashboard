"use client"

import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api"

type MediaItem = { id: number; url?: string | null; mime?: string | null; title?: string | null }

export function MediaPickerDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (item: { id: number; url: string }) => void
}) {
  const [search, setSearch] = useState("")
  const q = useQuery({
    queryKey: ["media", "picker", search],
    enabled: open,
    queryFn: () => {
      const p = new URLSearchParams({ per_page: "48", page: "1" })
      if (search.trim()) p.set("search", search.trim())
      return api<{ items: MediaItem[] }>(`/api/v1/media?${p}`)
    },
  })
  const items = (q.data?.items ?? []).filter((i) => i.mime?.startsWith("image/") && i.url)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>انتخاب تصویر</DialogTitle>
        </DialogHeader>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جستجو…" />
        <div className="mt-3 grid max-h-80 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="hover:ring-primary overflow-hidden rounded-lg border ring-offset-2 hover:ring-2"
              onClick={() => {
                if (!item.url) return
                onPick({ id: item.id, url: item.url })
                onOpenChange(false)
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url!} alt={item.title || ""} className="aspect-square object-cover" />
            </button>
          ))}
        </div>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          بستن
        </Button>
      </DialogContent>
    </Dialog>
  )
}
