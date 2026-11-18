"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { MediaPickerField } from "@/components/content/MediaPickerField"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import type { CafeGalleryImage, CafeGallerySettings } from "@/themes/cafe-starter/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

import { CafeAdminShell, CafeEmptyState, CafeSection } from "./cafe-admin-ui"

export default function GalleryPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.gallery")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()
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
      toast.success(t("saved"))
      await queryClient.invalidateQueries({ queryKey: ["cafe-gallery-settings"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
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
    <CafeAdminShell
      title={t("title")}
      description={t("description")}
      actions={
        <Button onClick={() => save.mutate()} disabled={save.isPending || isLoading}>
          {tCommon("save")}
        </Button>
      }
    >
      {isLoading ? <p className="text-muted-foreground text-sm">{tCommon("loading")}</p> : null}

      <CafeSection title={t("add_heading")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <MediaPickerField
              label={t("image_url")}
              imageUrl={draft.url}
              onPick={(item) => setDraft((d) => ({ ...d, url: item.url }))}
              onClear={() => setDraft((d) => ({ ...d, url: "" }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("caption_fa")}</Label>
            <Input value={draft.caption_fa ?? ""} onChange={(e) => setDraft((d) => ({ ...d, caption_fa: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("caption_en")}</Label>
            <Input value={draft.caption_en ?? ""} onChange={(e) => setDraft((d) => ({ ...d, caption_en: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={addImage} disabled={!draft.url.trim()}>
              <Plus className="me-2 size-4" />
              {t("add_image")}
            </Button>
          </div>
        </div>
      </CafeSection>

      <CafeSection title={t("images_heading")}>
        {values.images.length === 0 ? (
          <CafeEmptyState message={t("empty")} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {values.images.map((img, index) => (
              <li key={`${img.url}-${index}`} className="overflow-hidden rounded-lg border">
                <div className="bg-muted aspect-[4/3] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.caption_fa || img.caption_en || ""} className="size-full object-cover" />
                </div>
                <div className="flex items-start justify-between gap-2 p-3">
                  <p className="text-muted-foreground line-clamp-2 text-xs">
                    {img.caption_fa || img.caption_en || "—"}
                  </p>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 shrink-0"
                    title={t("delete_action")}
                    aria-label={t("delete_action")}
                    onClick={() => removeImage(index)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CafeSection>
    </CafeAdminShell>
  )
}
