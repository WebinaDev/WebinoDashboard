"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import type { ShopProduct } from "@/builder/catalog"
import { StorefrontPageShell } from "@/builder/storefront/storefront-chrome"
import { StoreProductCard } from "@/builder/storefront/ui"
import { fetchCatalogPayload } from "@/builder/storefront/use-catalog"

const PER_PAGE = 24
const fa = (n: number) => n.toLocaleString("fa-IR")

/** HH:MM:SS (or «N روز» prefix) until a timed sale ends; ticks every second. */
function OfferCountdown({ endsAt, now }: { endsAt: string; now: number | null }) {
  const t = useTranslations("storefront")
  const end = Date.parse(endsAt)
  if (!Number.isFinite(end) || now == null) return null
  const diff = Math.max(0, end - now)
  if (!diff) return <span className="text-xs text-muted-foreground">{t("offers_ended")}</span>
  const days = Math.floor(diff / 86400000)
  const hms = [Math.floor((diff % 86400000) / 3600000), Math.floor((diff % 3600000) / 60000), Math.floor((diff % 60000) / 1000)]
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-rose-600">
      {t("offers_ends_in")}
      {days > 0 ? <b>{fa(days)} روز و</b> : null}
      <b dir="ltr" className="tabular-nums">{hms.map((v) => fa(v).padStart(2, "۰")).join(":")}</b>
    </span>
  )
}

/** Remaining-stock bar (parisma «تنها N عدد باقی مانده»); only for managed low stock. */
function StockBar({ stock }: { stock: number }) {
  const t = useTranslations("storefront")
  if (stock <= 0 || stock > 20) return null
  return (
    <div className="space-y-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.max(8, Math.min(100, (stock / 20) * 100))}%` }} />
      </div>
      <span className="text-[11px] text-muted-foreground">{t("offers_left", { count: fa(stock) })}</span>
    </div>
  )
}

export default function AmazingOffersPage() {
  const t = useTranslations("storefront")
  const [items, setItems] = useState<ShopProduct[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancel = false
    setLoading(true)
    const query = new URLSearchParams({ offers: "1", sort: "ending_soon", per_page: String(PER_PAGE), page: String(page) })
    void fetchCatalogPayload(query.toString()).then((payload) => {
      if (cancel) return
      setLoading(false)
      if (!payload) return
      // Server filters to live discounts; keep a client guard for stale caches.
      const fresh = payload.items.filter((p) => p.compare && p.compare > p.price)
      setItems((prev) => (page === 1 ? fresh : [...prev, ...fresh.filter((p) => !prev.some((x) => x.slug === p.slug))]))
      setTotal(payload.total)
    })
    return () => {
      cancel = true
    }
  }, [page])

  return (
    <StorefrontPageShell
      wide
      title={t("amazing_offers_title")}
      description={total ? t("offers_count", { count: fa(total) }) : t("amazing_offers_hint")}
      trail={[{ label: t("home_crumb"), href: "/" }, { label: t("amazing_offers_title") }]}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((product) => (
          <div key={product.slug} className="flex flex-col gap-2">
            <StoreProductCard product={product} />
            {product.saleEndsAt || (product.stock != null && product.stock <= 20) ? (
              <div className="space-y-2 px-1">
                {product.saleEndsAt ? <OfferCountdown endsAt={product.saleEndsAt} now={now} /> : null}
                {product.stock != null ? <StockBar stock={product.stock} /> : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {!loading && !items.length ? <p className="mt-8 text-sm text-muted-foreground">{t("empty_none")}</p> : null}
      {items.length < total ? (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border px-6 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {t("offers_load_more")}
          </button>
        </div>
      ) : null}
    </StorefrontPageShell>
  )
}
