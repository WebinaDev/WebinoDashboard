"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTranslations } from "next-intl"

export type CouponOffer = {
  buy?: number
  get?: number
  get_percent?: number
  bundle_price_minor?: number
  tiers?: { min_qty: number; percent: number }[]
}

export const OFFER_TYPES = ["bogo", "bundle", "tiered"] as const

const num = (v: string) => (v.trim() === "" ? undefined : Math.max(0, Math.floor(Number(v)) || 0))

/** Offer-engine params (BOGO / bundle / tiered) stored in coupon.restrictions.offer. */
export function CouponOfferFields({ type, offer, setOffer }: { type: string; offer: CouponOffer; setOffer: (o: CouponOffer) => void }) {
  const t = useTranslations("coupons.offer")
  if (type === "bogo") {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label>{t("buy")}</Label>
          <Input type="number" min={1} value={offer.buy ?? 1} onChange={(e) => setOffer({ ...offer, buy: num(e.target.value) })} />
        </div>
        <div className="space-y-1">
          <Label>{t("get")}</Label>
          <Input type="number" min={1} value={offer.get ?? 1} onChange={(e) => setOffer({ ...offer, get: num(e.target.value) })} />
        </div>
        <div className="space-y-1">
          <Label>{t("get_percent")}</Label>
          <Input type="number" min={1} max={100} value={offer.get_percent ?? 100} onChange={(e) => setOffer({ ...offer, get_percent: num(e.target.value) })} />
        </div>
        <p className="text-muted-foreground text-xs sm:col-span-3">{t("bogo_hint")}</p>
      </div>
    )
  }
  if (type === "bundle") {
    return (
      <div className="space-y-1">
        <Label>{t("bundle_price")}</Label>
        <Input
          type="number"
          min={0}
          value={offer.bundle_price_minor ?? ""}
          onChange={(e) => setOffer({ ...offer, bundle_price_minor: num(e.target.value) })}
        />
        <p className="text-muted-foreground text-xs">{t("bundle_hint")}</p>
      </div>
    )
  }
  if (type === "tiered") {
    const text = (offer.tiers ?? []).map((r) => `${r.min_qty}:${r.percent}`).join("\n")
    return (
      <div className="space-y-1">
        <Label>{t("tiers")}</Label>
        <textarea
          dir="ltr"
          className="border-input bg-background min-h-20 w-full rounded-md border p-2 font-mono text-sm"
          defaultValue={text}
          onBlur={(e) =>
            setOffer({
              ...offer,
              tiers: e.target.value
                .split(/\n+/)
                .map((l) => l.split(":").map((x) => Number(x.trim())))
                .filter(([q, p]) => q > 0 && p > 0 && p <= 100)
                .map(([min_qty, percent]) => ({ min_qty, percent })),
            })
          }
        />
        <p className="text-muted-foreground text-xs">{t("tiers_hint")}</p>
      </div>
    )
  }
  return null
}
