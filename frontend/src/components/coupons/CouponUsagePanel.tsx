"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTranslations } from "next-intl"

export function CouponUsagePanel(props: {
  freeShipping: boolean
  setFreeShipping: (v: boolean) => void
  individualUse: boolean
  setIndividualUse: (v: boolean) => void
  excludeSale: boolean
  setExcludeSale: (v: boolean) => void
  minSpend: string
  setMinSpend: (v: string) => void
  maxSpend: string
  setMaxSpend: (v: string) => void
  usageLimit: string
  setUsageLimit: (v: string) => void
  usagePerUser: string
  setUsagePerUser: (v: string) => void
  expiresAt: string
  setExpiresAt: (v: string) => void
}) {
  const t = useTranslations("coupons")
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>{t("fields.min_spend")}</Label>
          <Input value={props.minSpend} onChange={(e) => props.setMinSpend(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>{t("fields.max_spend")}</Label>
          <Input value={props.maxSpend} onChange={(e) => props.setMaxSpend(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>{t("fields.usage_limit")}</Label>
          <Input value={props.usageLimit} onChange={(e) => props.setUsageLimit(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>{t("fields.usage_per_user")}</Label>
          <Input value={props.usagePerUser} onChange={(e) => props.setUsagePerUser(e.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>{t("fields.expires")}</Label>
          <Input type="datetime-local" value={props.expiresAt} onChange={(e) => props.setExpiresAt(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={props.freeShipping} onCheckedChange={(v) => props.setFreeShipping(Boolean(v))} />
          {t("fields.free_shipping")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={props.individualUse} onCheckedChange={(v) => props.setIndividualUse(Boolean(v))} />
          {t("fields.individual_use")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={props.excludeSale} onCheckedChange={(v) => props.setExcludeSale(Boolean(v))} />
          {t("fields.exclude_sale")}
        </label>
      </div>
    </div>
  )
}
