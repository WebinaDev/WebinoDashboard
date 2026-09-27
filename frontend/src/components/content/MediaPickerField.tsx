"use client"

import { useTranslations } from "next-intl"
import { useState } from "react"

import { MediaPickerDialog } from "@/components/content/MediaPickerDialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

export function MediaPickerField({
  label,
  imageUrl,
  onPick,
  onClear,
}: {
  label: string
  imageUrl: string
  onPick: (item: { id: number; url: string; alt?: string | null }) => void
  onClear?: () => void
}) {
  const t = useTranslations("store")
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="aspect-square max-h-32 w-auto rounded-lg border object-cover" />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          {t("pick_image")}
        </Button>
        {imageUrl && onClear ? (
          <Button type="button" size="sm" variant="ghost" onClick={onClear}>
            {t("clear_image")}
          </Button>
        ) : null}
      </div>
      <MediaPickerDialog
        open={open}
        onOpenChange={setOpen}
        onPick={(item) => {
          onPick(item)
          setOpen(false)
        }}
      />
    </div>
  )
}
