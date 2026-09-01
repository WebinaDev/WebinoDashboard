"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import type { CafeGalleryImage, CafeGallerySettings } from "@/themes/cafe-starter/types"
import { api } from "@/lib/api"

export default function GalleryPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.gallery")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)
  const [draft, setDraft] = useState<CafeGalleryImage>({ url: "", caption_fa: "", caption_en: "", sort_order: 0 })

  const { data, isLoading } = useQuery({
    queryKey: ["cafe-gallery-settings"],
    queryFn: () => api<CafeGallerySettings>("/api/v1/cafe/gallery-settings"),
  })

  const [form, setForm] = useState<CafeGallerySettings | null>(null)
  const values = form ?? data ?? { images: [] }

  const save = useMutation({
    mutationFn: () => api<CafeGallerySettings>("/api/v1/cafe/gallery-settings", { method: "PATCH", json: values }),
    onSuccess: async () => {
      setMessage(t("saved"))
      await queryClient.invalidateQueries({ queryKey: ["cafe-gallery-settings"] })
    },
  })

  function addImage() {
    if (!draft.url.trim()) return
    setForm({
      images: [...values.images, { ...draft, sort_order: values.images.length }],
    })
    setDraft({ url: "", caption_fa: "", caption_en: "", sort_order: 0 })
  }

  function removeImage(index: number) {
    setForm({ images: values.images.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{route.fullPath}</p>
      </div>
      {isLoading ? <p>{tCommon("loading")}</p> : null}
      {message ? <p className="text-sm text-green-600">{message}</p> : null}

      <Card>
        <CardHeader><CardTitle>{t("add_heading")}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>{t("image_url")}</Label>
            <Input value={draft.url} onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))} />
          </div>
          <div>
            <Label>{t("caption_fa")}</Label>
            <Input value={draft.caption_fa ?? ""} onChange={(e) => setDraft((d) => ({ ...d, caption_fa: e.target.value }))} />
          </div>
          <div>
            <Label>{t("caption_en")}</Label>
            <Input value={draft.caption_en ?? ""} onChange={(e) => setDraft((d) => ({ ...d, caption_en: e.target.value }))} />
          </div>
          <Button onClick={addImage} className="sm:col-span-2">
            <Plus className="mr-2 size-4" />
            {t("add_image")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("images_heading")}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {values.images.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("empty")}</p>
          ) : (
            values.images.map((img, index) => (
              <div key={`${img.url}-${index}`} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-medium">{img.url}</p>
                  <p className="text-muted-foreground text-xs">{img.caption_fa || img.caption_en}</p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => removeImage(index)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Button onClick={() => save.mutate()} disabled={save.isPending}>{tCommon("save")}</Button>
    </div>
  )
}
