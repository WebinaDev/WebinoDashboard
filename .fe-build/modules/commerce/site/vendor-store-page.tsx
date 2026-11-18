"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"

import type { ResolvedSiteRoute } from "@/kernel/types"
import { StorefrontPageShell } from "@/builder/storefront/storefront-chrome"
import { StoreProductCard } from "@/builder/storefront/ui"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import { mapApiProduct, type ShopProduct } from "@/builder/catalog"

type StorePayload = {
  store: { name: string; slug: string; bio?: string | null; logo_url?: string | null }
  products: Array<{
    id: number
    slug: string
    name: string
    price_minor: number
    compare_at_minor?: number | null
    image_url?: string | null
    discount_percent?: number | null
  }>
}

export default function VendorStorePage({ route }: { route: ResolvedSiteRoute }) {
  const t = useTranslations("storefront")
  const locale = useLocale()
  const slug = route.params?.slug ?? ""
  const [data, setData] = useState<StorePayload | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!slug) return
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    fetch(`${base}/api/v1/public/vendor-stores/${encodeURIComponent(slug)}`, { credentials: "include" })
      .then((res) => {
        if (res.status === 404) {
          setMissing(true)
          return null
        }
        return res.ok ? res.json() : null
      })
      .then((json) => {
        if (json?.data?.store) setData(json.data as StorePayload)
      })
  }, [slug])

  const products: ShopProduct[] =
    data?.products.map((row, index) =>
      mapApiProduct(
        {
          id: row.id,
          slug: row.slug,
          name: row.name,
          price_minor: row.price_minor,
          sale_price_minor: row.compare_at_minor ? row.price_minor : null,
          image_url: row.image_url,
          cover_image_url: row.image_url,
          discount_percent: row.discount_percent,
        },
        index,
      ),
    ) ?? []

  if (missing) {
    return (
      <StorefrontPageShell
        title={t("vendor_store_missing")}
        trail={[
          { label: t("home_crumb"), href: "/" },
          { label: t("vendor_store_title") },
        ]}
      >
        <p className="text-sm text-muted-foreground">{t("empty_none")}</p>
        <Link href="/shop" className="mt-4 inline-flex rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground">
          {t("continue_shop")}
        </Link>
      </StorefrontPageShell>
    )
  }

  if (!data) {
    return (
      <StorefrontPageShell
        title={t("vendor_store_title")}
        trail={[
          { label: t("home_crumb"), href: "/" },
          { label: t("vendor_store_title") },
        ]}
      >
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      </StorefrontPageShell>
    )
  }

  const money = (minor: number) =>
    `${formatNumber(Math.round(minor), normalizeUiLocale(locale))} ${t("currency_toman")}`

  return (
    <StorefrontPageShell
      wide
      title={data.store.name}
      description={data.store.bio || undefined}
      trail={[
        { label: t("home_crumb"), href: "/" },
        { label: t("vendor_store_title"), href: "/shop" },
        { label: data.store.name },
      ]}
    >
      <div className="sf-vendor-hero sf-card flex flex-col gap-4 p-6 md:flex-row md:items-center">
        <div className="size-20 overflow-hidden rounded-2xl bg-muted">
          {data.store.logo_url ? (
            <img src={data.store.logo_url} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="grid h-full w-full place-items-center text-2xl font-bold text-primary">{data.store.name.slice(0, 1)}</div>
          )}
        </div>
        <div className="flex-1">
          <p className="text-xs font-bold text-primary">{t("vendor_store_title")}</p>
          <p className="mt-1 text-sm leading-7 text-muted-foreground">{data.store.bio || t("vendor_store_bio_empty")}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("vendor_store_product_count", { count: products.length })}
          </p>
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {products.map((product) => (
          <StoreProductCard key={product.slug} product={product} />
        ))}
      </div>
      {!products.length ? (
        <p className="mt-8 text-sm text-muted-foreground">{t("vendor_store_empty")}</p>
      ) : null}
      {products.length ? (
        <p className="sr-only" aria-live="polite">
          {products.map((p) => `${p.name} ${money(p.price)}`).join(", ")}
        </p>
      ) : null}
    </StorefrontPageShell>
  )
}
