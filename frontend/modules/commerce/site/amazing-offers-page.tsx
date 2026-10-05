"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"

import { StoreProductCard } from "@/builder/storefront/ui"
import { useCatalog } from "@/builder/storefront/use-catalog"

export default function AmazingOffersPage() {
  const t = useTranslations("storefront")
  const catalog = useCatalog(48)
  const offers = useMemo(
    () => catalog.products.filter((product) => product.compare && product.compare > product.price),
    [catalog.products],
  )

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold">{t("amazing_offers_title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("amazing_offers_hint")}</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {offers.map((product) => (
          <StoreProductCard key={product.slug} product={product} />
        ))}
      </div>
      {!offers.length ? <p className="mt-8 text-sm text-muted-foreground">{t("empty_none")}</p> : null}
    </div>
  )
}
