"use client"

import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useEnumLabel } from "@/lib/enum-labels"
import { useTranslations } from "next-intl"

const STATUSES = ["publish", "draft"] as const

export function CouponPublishPanel({
  status,
  setStatus,
}: {
  status: string
  setStatus: (v: string) => void
}) {
  const t = useTranslations("coupons")
  const enumLabel = useEnumLabel()
  return (
    <div className="space-y-1">
      <Label>{t("fields.status")}</Label>
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((value) => (
            <SelectItem key={value} value={value}>
              {enumLabel("product_status", value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
