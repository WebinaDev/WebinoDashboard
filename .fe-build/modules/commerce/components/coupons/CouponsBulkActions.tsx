"use client"

import { useMutation } from "@tanstack/react-query"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

export function CouponsBulkActions({
  selectedIds,
  onDone,
}: {
  selectedIds: number[]
  onDone: () => void
}) {
  const t = useTranslations("coupons")
  const bulk = useMutation({
    mutationFn: () => api("/api/v1/marketing/coupons/bulk", { method: "POST", json: { action: "trash", ids: selectedIds } }),
    onSuccess: () => onDone(),
  })

  if (selectedIds.length === 0) return null

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-sm">{t("selectedCount", { count: selectedIds.length })}</span>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={bulk.isPending}
        onClick={() => bulk.mutate()}
      >
        {t("actions.bulkTrash")}
      </Button>
      {bulk.isError ? <span className="text-destructive text-xs">{getApiErrorMessage(bulk.error)}</span> : null}
    </div>
  )
}
