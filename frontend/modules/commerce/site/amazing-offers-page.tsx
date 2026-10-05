"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"

import { IshopStorefrontPage } from "@/builder/storefront/ishop-port"
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
    <IshopStorefrontPage
      wide
      title={t("amazing_offers_title")}
      description={t("amazing_offers_hint")}
      trail={[
        { label: t("home_crumb"), href: "/" },
        { label: t("amazing_offers_title") },
      ]}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {offers.map((product) => (
          <StoreProductCard key={product.slug} product={product} />
        ))}
      </div>
      {!offers.length ? <p className="mt-8 text-sm text-muted-foreground">{t("empty_none")}</p> : null}
    </IshopStorefrontPage>
  )
}
