"use client"

import Image from "next/image"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { Heart, Star } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"

import { CafeCartDrawer } from "../components/CafeCartDrawer"
import type { CatalogItem } from "../types"

function formatPrice(amount: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount / 10)
  } catch {
    return `${amount}`
  }
}

function localized(locale: string, fa?: string | null, en?: string | null) {
  return locale === "fa" ? fa ?? en : en ?? fa
}

export function ItemDetailView({
  item,
  tableNumber,
  branchSlug,
}: {
  item: CatalogItem
  tableNumber?: string | null
  branchSlug?: string | null
}) {
  const t = useTranslations("cafe_starter")
  const locale = useLocale()
  const [likes, setLikes] = useState(item.likes_count ?? 0)
  const [selectedVariant, setSelectedVariant] = useState<number | null>(item.variants?.find((v) => v.is_default)?.id ?? item.variants?.[0]?.id ?? null)
  const [selectedOptions, setSelectedOptions] = useState<Record<number, number[]>>({})
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState("")
  const [message, setMessage] = useState<string | null>(null)

  const image = item.cover_image_url ?? item.image_url
  const price = formatPrice(item.discounted_price_minor, item.currency, locale)

  async function addToCart() {
    const token = localStorage.getItem("cafe_guest_token") ?? crypto.randomUUID().replace(/-/g, "")
    localStorage.setItem("cafe_guest_token", token)
    await api("/api/v1/public/cafe/cart/items", {
      method: "POST",
      json: {
        product_id: item.id,
        quantity: 1,
        guest_token: token,
        table_number: tableNumber,
        branch_slug: branchSlug,
      },
    })
    setMessage(t("added_to_cart"))
  }

  async function likeItem() {
    const fp = localStorage.getItem("cafe_fingerprint") ?? crypto.randomUUID().replace(/-/g, "")
    localStorage.setItem("cafe_fingerprint", fp)
    const res = await api<{ likes_count: number }>(`/api/v1/public/cafe/products/${item.id}/like`, {
      method: "POST",
      json: { fingerprint: fp },
    })
    setLikes(res.likes_count)
  }

  async function submitFeedback() {
    const fp = localStorage.getItem("cafe_fingerprint") ?? ""
    await api(`/api/v1/public/cafe/products/${item.id}/feedback`, {
      method: "POST",
      json: { rating, comment, fingerprint: fp || undefined },
    })
    setMessage(t("feedback_sent"))
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/catalogue">{t("back_to_menu")}</Link>
        </Button>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          {item.video_url ? (
            <video src={item.video_url} controls className="aspect-video w-full rounded-xl bg-black" />
          ) : image ? (
            <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
              <Image src={image} alt={item.name} fill className="object-cover" unoptimized />
            </div>
          ) : null}
          {item.media && item.media.length > 1 ? (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {item.media.map((m) => (
                <div key={m.id} className="relative size-20 shrink-0 overflow-hidden rounded-lg">
                  <Image src={m.url} alt="" fill className="object-cover" unoptimized />
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">{item.name}</h1>
              {item.category ? <p className="text-muted-foreground mt-1">{item.category.name}</p> : null}
            </div>
            <Button variant="outline" size="sm" onClick={() => void likeItem()}>
              <Heart className="mr-1 size-4" />
              {likes}
            </Button>
          </div>

          <p className="mt-4 text-2xl font-bold">{price}</p>

          {item.description ? <p className="text-muted-foreground mt-4 whitespace-pre-line">{item.description}</p> : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {item.calories ? <Badge variant="outline">{t("calories", { count: item.calories })}</Badge> : null}
            {(item.spice_level ?? 0) > 0 ? <Badge variant="outline">{t("spice_level", { level: item.spice_level })}</Badge> : null}
            {item.allergens?.map((a) => (
              <Badge key={a.id} variant="secondary">{localized(locale, a.name_fa, a.name_en)}</Badge>
            ))}
          </div>

          {item.variants && item.variants.length > 0 ? (
            <div className="mt-6">
              <p className="mb-2 text-sm font-medium">{t("select_variant")}</p>
              <div className="flex flex-wrap gap-2">
                {item.variants.map((v) => (
                  <Button key={v.id} size="sm" variant={selectedVariant === v.id ? "default" : "outline"} onClick={() => setSelectedVariant(v.id)}>
                    {v.name}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {item.modifiers?.map((mod) => (
            <div key={mod.id} className="mt-6">
              <p className="mb-2 text-sm font-medium">
                {localized(locale, mod.name_fa, mod.name_en)}
                {mod.is_required ? ` (${t("required")})` : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                {mod.options.map((opt) => {
                  const selected = selectedOptions[mod.id]?.includes(opt.id)
                  return (
                    <Button
                      key={opt.id}
                      size="sm"
                      variant={selected ? "default" : "outline"}
                      onClick={() => {
                        setSelectedOptions((prev) => {
                          const current = prev[mod.id] ?? []
                          const next = selected ? current.filter((id) => id !== opt.id) : [...current, opt.id]
                          return { ...prev, [mod.id]: next.slice(0, mod.max_select) }
                        })
                      }}
                    >
                      {localized(locale, opt.name_fa, opt.name_en)}
                    </Button>
                  )
                })}
              </div>
            </div>
          ))}

          <div className="mt-8 flex flex-wrap gap-3">
            <Button disabled={!item.is_available || item.is_sold_out} onClick={() => void addToCart()}>
              {t("add_to_cart")}
            </Button>
            <CafeCartDrawer tableNumber={tableNumber} branchSlug={branchSlug} />
          </div>

          {message ? <p className="mt-3 text-sm text-green-600">{message}</p> : null}

          <div className="mt-10 rounded-xl border p-4">
            <p className="mb-2 flex items-center gap-1 font-medium">
              <Star className="size-4" />
              {t("feedback_heading")}
            </p>
            <div className="mb-2 flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <Button key={n} size="sm" variant={rating >= n ? "default" : "outline"} onClick={() => setRating(n)}>
                  {n}
                </Button>
              ))}
            </div>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("feedback_placeholder")} />
            <Button className="mt-2" size="sm" variant="outline" onClick={() => void submitFeedback()}>
              {t("feedback_submit")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
