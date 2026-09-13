"use client"

import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { useTranslations } from "next-intl"

export function CouponGeneralPanel({
  code,
  setCode,
  type,
  setType,
  amount,
  setAmount,
  description,
  setDescription,
  onGenerate,
}: {
  code: string
  setCode: (v: string) => void
  type: string
  setType: (v: string) => void
  amount: number
  setAmount: (v: number) => void
  description: string
  setDescription: (v: string) => void
  onGenerate: () => void
}) {
  const t = useTranslations("coupons")
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="coupon-code">{t("fields.code")}</Label>
          <Input id="coupon-code" className="font-mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </div>
        <Button type="button" className="mt-6" variant="secondary" onClick={onGenerate}>
          {t("actions.generate")}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>{t("fields.type")}</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">percent</SelectItem>
              <SelectItem value="fixed_cart">fixed_cart</SelectItem>
              <SelectItem value="fixed_product">fixed_product</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="coupon-amount">{t("fields.amount")}</Label>
          <Input id="coupon-amount" type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="coupon-desc">{t("fields.description")}</Label>
        <Textarea id="coupon-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
    </div>
  )
}
