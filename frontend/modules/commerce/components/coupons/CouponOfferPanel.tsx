"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTranslations } from "next-intl"

export const CONDITION_TYPES = ["none", "order_nth", "min_amount", "min_items"] as const

export function CouponOfferPanel(props: {
  conditionType: string
  setConditionType: (v: string) => void
  conditionValue: string
  setConditionValue: (v: string) => void
  autoApply: boolean
  setAutoApply: (v: boolean) => void
  maxDiscount: string
  setMaxDiscount: (v: string) => void
  shippingPercent: string
  setShippingPercent: (v: string) => void
}) {
  const t = useTranslations("coupons")
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>{t("offer.condition_type")}</Label>
          <Select value={props.conditionType} onValueChange={props.setConditionType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONDITION_TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`conditionTypes.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="coupon-condition-value">{t("offer.condition_value")}</Label>
          <Input
            id="coupon-condition-value"
            type="number"
            min={0}
            disabled={props.conditionType === "none"}
            value={props.conditionValue}
            onChange={(e) => props.setConditionValue(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="coupon-max-discount">{t("offer.max_discount")}</Label>
          <Input
            id="coupon-max-discount"
            type="number"
            min={0}
            value={props.maxDiscount}
            onChange={(e) => props.setMaxDiscount(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="coupon-shipping-percent">{t("offer.shipping_percent")}</Label>
          <Input
            id="coupon-shipping-percent"
            type="number"
            min={0}
            max={100}
            value={props.shippingPercent}
            onChange={(e) => props.setShippingPercent(e.target.value)}
          />
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={props.autoApply} onCheckedChange={(v) => props.setAutoApply(v === true)} />
        <span>
          {t("offer.auto_apply")}
          <span className="text-muted-foreground block text-xs">{t("offer.auto_apply_hint")}</span>
        </span>
      </label>
    </div>
  )
}
