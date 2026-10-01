"use client"

import { useTranslations } from "next-intl"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useEnumLabel } from "@/lib/enum-labels"

const STATUSES = ["publish", "draft", "pending", "private", "future"] as const
const VISIBILITIES = ["public", "private", "password"] as const

export function CouponPublishPanel({
  status,
  setStatus,
  visibility = "public",
  setVisibility,
  password = "",
  setPassword,
  scheduledAt = "",
  setScheduledAt,
}: {
  status: string
  setStatus: (v: string) => void
  visibility?: string
  setVisibility?: (v: string) => void
  password?: string
  setPassword?: (v: string) => void
  scheduledAt?: string
  setScheduledAt?: (v: string) => void
}) {
  const t = useTranslations("coupons")
  const enumLabel = useEnumLabel()
  return (
    <div className="space-y-3">
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
      {setVisibility ? (
        <div className="space-y-1">
          <Label>{t("fields.visibility")}</Label>
          <Select value={visibility} onValueChange={setVisibility}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VISIBILITIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`visibility.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {setPassword && visibility === "password" ? (
        <div className="space-y-1">
          <Label>{t("fields.password")}</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
        </div>
      ) : null}
      {setScheduledAt && (status === "future" || status === "pending") ? (
        <div className="space-y-1">
          <Label>{t("fields.scheduled_at")}</Label>
          <Input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            dir="ltr"
          />
        </div>
      ) : null}
    </div>
  )
}
