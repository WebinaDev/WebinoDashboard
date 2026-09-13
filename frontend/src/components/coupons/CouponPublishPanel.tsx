"use client"

import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTranslations } from "next-intl"

export function CouponPublishPanel({
  status,
  setStatus,
}: {
  status: string
  setStatus: (v: string) => void
}) {
  const t = useTranslations("coupons")
  return (
    <div className="space-y-1">
      <Label>{t("fields.status")}</Label>
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="publish">publish</SelectItem>
          <SelectItem value="draft">draft</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
