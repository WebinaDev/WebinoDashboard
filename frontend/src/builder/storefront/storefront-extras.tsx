"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"

import { formatDate, formatNumber, normalizeUiLocale } from "@/lib/locale"

export function StorefrontCompareTable({
  items,
  money,
  onRemove,
}: {
  items: Array<{ id: number; slug: string; name: string; price_minor: number; brand?: string | null; category?: string | null; in_stock?: boolean }>
  money: (minor: number) => string
  onRemove: (id: number) => void
}) {
  const t = useTranslations("storefront")
  const base = process.env.NEXT_PUBLIC_API_URL ?? ""

  return (
    <div className="overflow-x-auto sf-card">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-border text-start">
            <th className="p-3">{t("compare_field_name")}</th>
            {items.map((item) => (
              <th key={item.id} className="p-3 align-top">
                <Link href={`/product/${item.slug}`} className="font-bold">
                  {item.name}
                </Link>
                <button type="button" className="mt-2 block text-xs text-destructive" onClick={() => void removeCompare(base, item.id, onRemove)}>
                  {t("compare_remove")}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border">
            <td className="p-3 font-semibold">{t("compare_field_price")}</td>
            {items.map((item) => (
              <td key={item.id} className="p-3">
                {money(item.price_minor)}
              </td>
            ))}
          </tr>
          <tr className="border-b border-border">
            <td className="p-3 font-semibold">{t("brand")}</td>
            {items.map((item) => (
              <td key={item.id} className="p-3">
                {item.brand || "—"}
              </td>
            ))}
          </tr>
          <tr>
            <td className="p-3 font-semibold">{t("in_stock")}</td>
            {items.map((item) => (
              <td key={item.id} className="p-3">
                {item.in_stock ? t("stock_in") : t("stock_out")}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

async function removeCompare(base: string, id: number, onRemove: (id: number) => void) {
  await fetch(`${base}/api/v1/public/compare/products/${id}`, { method: "DELETE", credentials: "include" })
  onRemove(id)
}

export function ProductPriceHistory({ slug }: { slug: string }) {
  const t = useTranslations("storefront")
  const locale = useLocale()
  const [points, setPoints] = useState<{ price_minor: number; recorded_at?: string }[]>([])
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    fetch(`${base}/api/v1/public/catalog/items/${encodeURIComponent(slug)}/price-history`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        setPoints(Array.isArray(json?.data?.points) ? json.data.points : [])
        setUpdatedAt(json?.data?.price_updated_at ?? null)
      })
  }, [slug])

  if (!points.length) return null
  const max = Math.max(...points.map((p) => p.price_minor), 1)
  const min = Math.min(...points.map((p) => p.price_minor), max)

  return (
    <div className="sf-muted mt-4 rounded-3xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-bold">{t("price_history_title")}</div>
        {updatedAt ? (
          <div className="text-xs text-muted-foreground">
            {t("price_updated_at", { date: formatDate(updatedAt, normalizeUiLocale(locale)) })}
          </div>
        ) : null}
      </div>
      <svg viewBox="0 0 320 80" className="mt-3 h-20 w-full" role="img" aria-label={t("price_history_title")}>
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          points={points
            .slice()
            .reverse()
            .map((point, index, arr) => {
              const x = (index / Math.max(arr.length - 1, 1)) * 300 + 10
              const y = 70 - ((point.price_minor - min) / Math.max(max - min, 1)) * 50
              return `${x},${y}`
            })
            .join(" ")}
        />
      </svg>
      <div className="mt-1 text-xs text-muted-foreground">
        {formatNumber(min, normalizeUiLocale(locale))} – {formatNumber(max, normalizeUiLocale(locale))}
      </div>
    </div>
  )
}

export function ProductStoriesStrip() {
  const t = useTranslations("storefront")
  const [items, setItems] = useState<Array<{ id: number; title: string; media_url: string; link_url?: string | null; product_id?: number | null }>>([])

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    fetch(`${base}/api/v1/public/product-stories`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setItems(Array.isArray(json?.data?.items) ? json.data.items : []))
  }, [])

  if (!items.length) return null

  // Rectangular product-like cards (not Instagram rings) so highlight covers show fully.
  return (
    <section className="sf-stories-carousel mx-auto max-w-6xl px-4 py-4" aria-label={t("stories_title")}>
      <h2 className="mb-3 text-sm font-bold">{t("stories_title")}</h2>
      <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory">
        {items.map((item) => {
          const href = item.link_url || (item.product_id ? `/product/${item.product_id}` : "#")
          return (
            <Link
              key={item.id}
              href={href}
              className="relative block w-[42vw] max-w-[210px] min-w-[148px] shrink-0 snap-start overflow-hidden rounded-2xl bg-muted aspect-[4/5] shadow-sm transition-transform hover:-translate-y-0.5"
            >
              <img src={item.media_url} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
              <span className="absolute inset-x-0 bottom-0 z-[1] bg-gradient-to-t from-black/90 via-black/45 to-transparent px-3 pb-3 pt-8">
                <span className="line-clamp-2 text-start text-sm font-extrabold text-white">{item.title}</span>
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
