"use client"

import { BrandMultiSelect } from "@/components/coupons/BrandMultiSelect"
import { CategoryMultiSelect } from "@/components/coupons/CategoryMultiSelect"
import { ProductMultiSelect } from "@/components/coupons/ProductMultiSelect"
import { UserMultiSelect } from "@/components/coupons/UserMultiSelect"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useTranslations } from "next-intl"

const CHANNELS = ["site", "bale", "telegram"] as const

export function CouponRestrictionsPanel(props: {
  channels: string[]
  setChannels: (v: string[]) => void
  productIds: number[]
  setProductIds: (v: number[]) => void
  userIds: number[]
  setUserIds: (v: number[]) => void
  categoryIds: number[]
  setCategoryIds: (v: number[]) => void
  brandIds: number[]
  setBrandIds: (v: number[]) => void
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
              {t(`channelLabels.${ch}`)}
            </label>
          ))}
        </div>
      </div>
      <ProductMultiSelect label={t("fields.product_ids")} value={props.productIds} onChange={props.setProductIds} />
      <CategoryMultiSelect label={t("fields.category_ids")} value={props.categoryIds} onChange={props.setCategoryIds} />
      <BrandMultiSelect label={t("fields.brand_ids")} value={props.brandIds} onChange={props.setBrandIds} />
      <UserMultiSelect label={t("picker.user_ids")} value={props.userIds} onChange={props.setUserIds} />
      <div className="space-y-1">
        <Label>{t("fields.emails")}</Label>
        <Textarea value={props.emails} onChange={(e) => props.setEmails(e.target.value)} />
      </div>
    </div>
  )
}
