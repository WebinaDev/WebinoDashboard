"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"

import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import { StorefrontCompareTable } from "@/builder/storefront/ishop-extras"
import { IshopStorefrontPage } from "@/builder/storefront/ishop-port"

type CompareItem = {
  id: number
  slug: string
  name: string
  price_minor: number
  image_url?: string | null
  brand?: string | null
  category?: string | null
  in_stock?: boolean
}

export default function ComparePage() {
  const t = useTranslations("storefront")
  const locale = useLocale()
  const [items, setItems] = useState<CompareItem[]>([])
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    const url = `${base}/api/v1/public/compare${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`
    fetch(url, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        setItems(Array.isArray(json?.data?.items) ? json.data.items : [])
      })
      .finally(() => setLoading(false))
  }, [query])

  const money = (minor: number) =>
    `${formatNumber(Math.round(minor), normalizeUiLocale(locale))} ${t("currency_toman")}`

  return (
    <IshopStorefrontPage
      wide
      title={t("compare_title")}
      description={t("compare_hint")}
      trail={[
        { label: t("home_crumb"), href: "/" },
        { label: t("compare_title") },
      ]}
    >
      <div className="mb-6 flex flex-wrap items-end justify-end gap-3">
        <input
          className="sf-field h-11 min-w-[220px]"
          placeholder={t("compare_search")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {loading ? <p className="text-sm text-muted-foreground">{t("loading")}</p> : null}
      {!loading && !items.length ? (
        <div className="sf-card p-8 text-center">
          <p className="text-sm">{t("compare_empty")}</p>
          <Link href="/shop" className="mt-4 inline-flex rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground">
            {t("continue_shop")}
          </Link>
        </div>
      ) : null}
      {!loading && items.length ? (
        <StorefrontCompareTable items={items} money={money} onRemove={(id) => setItems((rows) => rows.filter((row) => row.id !== id))} />
      ) : null}
    </IshopStorefrontPage>
  )
}
