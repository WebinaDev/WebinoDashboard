"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"

import type { ResolvedSiteRoute } from "@/kernel/types"
import { IshopStorefrontPage } from "@/builder/storefront/ishop-port"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"

type WishlistItem = {
  id: number
  slug: string
  name: string
  price_minor: number
  image_url?: string | null
}

export default function WishlistPage({ route }: { route: ResolvedSiteRoute }) {
  const t = useTranslations("storefront")
  const locale = useLocale()
  const token = route.params?.token ?? ""
  const [owner, setOwner] = useState("")
  const [items, setItems] = useState<WishlistItem[]>([])

  useEffect(() => {
    if (!token) return
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    fetch(`${base}/api/v1/public/wishlist/${encodeURIComponent(token)}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        setOwner(String(json?.data?.owner_name ?? ""))
        setItems(Array.isArray(json?.data?.items) ? json.data.items : [])
      })
  }, [token])

  const money = (minor: number) =>
    `${formatNumber(Math.round(minor), normalizeUiLocale(locale))} ${t("currency_toman")}`

  return (
    <IshopStorefrontPage
      title={t("public_wishlist_title")}
      description={owner ? t("public_wishlist_owner", { name: owner }) : undefined}
      trail={[
        { label: t("home_crumb"), href: "/" },
        { label: t("public_wishlist_title") },
      ]}
    >
      <div className="grid gap-3">
        {items.map((item) => (
          <Link key={item.id} href={`/product/${item.slug}`} className="sf-card flex items-center gap-3 p-3">
            <div className="size-16 overflow-hidden rounded-2xl bg-muted">
              {item.image_url ? <img src={item.image_url} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}
            </div>
            <div className="flex-1">
              <div className="font-bold">{item.name}</div>
              <div className="text-sm">{money(item.price_minor)}</div>
            </div>
          </Link>
        ))}
      </div>
      {!items.length ? <p className="text-sm text-muted-foreground">{t("compare_empty")}</p> : null}
    </IshopStorefrontPage>
  )
}
