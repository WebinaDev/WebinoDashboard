"use client"

import { useTranslations } from "next-intl"
import { useState } from "react"

import { MediaPickerDialog, type MediaPickerAccept } from "@/components/content/MediaPickerDialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

export type MediaPickResult = { id: number; url: string; alt?: string | null; mime?: string | null }

function looksLikeVideo(url: string, mime?: string | null): boolean {
  if (mime?.startsWith("video/")) return true
  return /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(url)
}

export function MediaPickerField({
  label,
  imageUrl,
  onPick,
  onClear,
  accept = "image",
}: {
  label: string
  imageUrl: string
  onPick: (item: MediaPickResult) => void
  onClear?: () => void
  accept?: MediaPickerAccept
}) {
  const t = useTranslations("store")
  const [open, setOpen] = useState(false)
  const pickLabel =
    accept === "video" ? t("pick_video") : accept === "all" ? t("pick_media") : t("pick_image")
  const clearLabel = accept === "video" ? t("clear_video") : t("clear_image")
  const showVideo = Boolean(imageUrl) && (accept === "video" || looksLikeVideo(imageUrl))

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {imageUrl ? (
        showVideo ? (
          <video
            src={imageUrl}
            className="aspect-video max-h-40 w-full max-w-xs rounded-lg border object-cover"
            controls
            playsInline
            preload="metadata"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="aspect-square max-h-32 w-auto rounded-lg border object-cover" />
        )
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          {pickLabel}
        </Button>
        {imageUrl && onClear ? (
          <Button type="button" size="sm" variant="ghost" onClick={onClear}>
            {clearLabel}
          </Button>
        ) : null}
      </div>
      <MediaPickerDialog
        open={open}
        onOpenChange={setOpen}
        accept={accept}
        onPick={(item) => {
          onPick(item)
          setOpen(false)
        }}
      />
    </div>
  )
}
