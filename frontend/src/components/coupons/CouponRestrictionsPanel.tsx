"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useTranslations } from "next-intl"

const CHANNELS = ["site", "bale", "telegram"] as const

export function CouponRestrictionsPanel(props: {
  channels: string[]
  setChannels: (v: string[]) => void
  productIds: string
  setProductIds: (v: string) => void
  categoryIds: string
  setCategoryIds: (v: string) => void
  brandIds: string
  setBrandIds: (v: string) => void
  emails: string
  setEmails: (v: string) => void
}) {
  const t = useTranslations("coupons")
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>{t("fields.channels")}</Label>
        <div className="flex flex-wrap gap-3">
          {CHANNELS.map((ch) => (
            <label key={ch} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={props.channels.includes(ch)}
                onCheckedChange={(v) =>
                  props.setChannels(
                    v ? [...new Set([...props.channels, ch])] : props.channels.filter((x) => x !== ch),
                  )
                }
              />
              {ch}
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <Label>{t("fields.product_ids")}</Label>
        <Input value={props.productIds} onChange={(e) => props.setProductIds(e.target.value)} placeholder="1,2,3" />
      </div>
      <div className="space-y-1">
        <Label>{t("fields.category_ids")}</Label>
        <Input value={props.categoryIds} onChange={(e) => props.setCategoryIds(e.target.value)} placeholder="1,2" />
      </div>
      <div className="space-y-1">
        <Label>{t("fields.brand_ids")}</Label>
        <Input value={props.brandIds} onChange={(e) => props.setBrandIds(e.target.value)} placeholder="1,2" />
      </div>
      <div className="space-y-1">
        <Label>{t("fields.emails")}</Label>
        <Textarea value={props.emails} onChange={(e) => props.setEmails(e.target.value)} />
      </div>
    </div>
  )
}
