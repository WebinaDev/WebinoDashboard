"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"

type Badge = {
  id: string
  title: string
  description?: string
  dark?: boolean
  amount_minor?: number
  checkout_mode?: string
}

type Props = {
  productId?: number | null
  amountMinor?: number | null
  className?: string
}

export function InstallmentBadges({ productId, amountMinor, className }: Props) {
  const t = useTranslations("storefront_badges")
  const [badges, setBadges] = useState<Badge[]>([])

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    const params = new URLSearchParams()
    if (productId) params.set("product_id", String(productId))
    if (amountMinor != null) params.set("amount_minor", String(amountMinor))
    let cancel = false
    fetch(`${base}/api/v1/public/payments/installment-badges?${params.toString()}`, {
      credentials: "include",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: { badges?: Badge[] } } | null) => {
        if (!cancel) setBadges(json?.data?.badges ?? [])
      })
      .catch(() => {
        if (!cancel) setBadges([])
      })
    return () => {
      cancel = true
    }
  }, [productId, amountMinor])

  if (!badges.length) return null

  return (
    <div className={cn("mt-4 grid gap-2", className)}>
      <p className="text-xs font-semibold text-muted-foreground">{t("title")}</p>
      <div className="flex flex-wrap gap-2">
        {badges.map((badge) => (
          <a
            key={badge.id}
            href={`/checkout?mode=${badge.checkout_mode ?? "installment"}&gateway=${badge.id}`}
            className={cn(
              "inline-flex max-w-full items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition hover:opacity-90",
              badge.dark
                ? "border-zinc-700 bg-zinc-900 text-zinc-50"
                : "border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-100",
            )}
            title={badge.description || badge.title}
          >
            <span className="truncate">{t("pay_with", { gateway: badge.title })}</span>
          </a>
        ))}
      </div>
    </div>
  )
}
