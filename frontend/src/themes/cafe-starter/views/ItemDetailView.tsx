"use client"

import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { ArrowRight, Heart, Star } from "lucide-react"

import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

import { CafeCartDrawer } from "../components/CafeCartDrawer"
import { ItemPanel } from "../components/ItemSheet"
import { digits, keepQuery, readScheme } from "../lib/helpers"
import { cafeSkinLayout, resolveCafeSkin } from "../skin"
import "../menu.css"
import "../skins/item-page.css"
import type { CafeOrderingStatus, CatalogItem } from "../types"

export function ItemDetailView({
  item,
  tableNumber,
  branchSlug,
  activeThemeSlug,
  ordering,
}: {
  item: CatalogItem
  tableNumber?: string | null
  branchSlug?: string | null
  activeThemeSlug?: string | null
  ordering?: CafeOrderingStatus | null
}) {
  const t = useTranslations("cafe_starter")
  const locale = useLocale()
  const skin = resolveCafeSkin(activeThemeSlug)
  const layout = cafeSkinLayout(skin)
  const [scheme, setScheme] = useState<"light" | "dark">("light")
  const [likes, setLikes] = useState(item.likes_count ?? 0)
  const [liked, setLiked] = useState(false)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const qs = { table: tableNumber, branch: branchSlug }

  useEffect(() => {
    const stored = readScheme()
    if (stored) setScheme(stored)
    else if (skin === "cafe-signature" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) setScheme("dark")
  }, [skin])

  useEffect(() => {
    document.documentElement.dataset.cafeScheme = scheme
  }, [scheme])

  async function likeItem() {
    const fp = localStorage.getItem("cafe_fingerprint") ?? crypto.randomUUID().replace(/-/g, "")
    localStorage.setItem("cafe_fingerprint", fp)
    try {
      const res = await api<{ likes_count: number }>(`/api/v1/public/cafe/products/${item.id}/like`, {
        method: "POST",
        json: { fingerprint: fp },
      })
      setLikes(res.likes_count)
      setLiked(true)
    } catch {
      /* likes are best-effort */
    }
  }

  async function submitFeedback() {
    const fp = localStorage.getItem("cafe_fingerprint") ?? ""
    try {
      await api(`/api/v1/public/cafe/products/${item.id}/feedback`, {
        method: "POST",
        json: { rating, comment, fingerprint: fp || undefined },
      })
      setMessage(t("feedback_sent"))
      setComment("")
    } catch {
      setMessage(null)
    }
  }

  const ctx = {
    t: t as unknown as (key: string, values?: Record<string, string | number>) => string,
    locale,
    skin,
    scheme,
    ordering,
    qs,
    tableNumber,
    branchSlug,
  }

  return (
    <div className="cafe-shell cafe-item-page" data-skin={skin} data-layout={layout} data-scheme={scheme}>
      <div className="cafe-item-page-frame">
        <header className="cafe-item-page-top">
          <Link href={`/catalogue${keepQuery(qs)}`} className="cafe-item-back">
            <ArrowRight className="size-4 rtl:rotate-0 ltr:rotate-180" />
            {t("back_to_menu")}
          </Link>
          <div className="cafe-tool-cluster">
            <button type="button" className={cn("cafe-icon-btn", liked && "is-on")} onClick={() => void likeItem()} aria-label={t("feedback_heading")}>
              <Heart className="size-4" />
              <span className="cafe-like-count">{digits(likes, locale)}</span>
            </button>
            <CafeCartDrawer tableNumber={tableNumber} branchSlug={branchSlug} ordering={ordering} currency={item.currency} skin={skin} scheme={scheme} />
          </div>
        </header>

        <ItemPanel ctrl={ctx} item={item} />

        <section className="cafe-feedback">
          <h2>
            <Star className="size-4" />
            {t("feedback_heading")}
          </h2>
          <div className="cafe-stars" role="radiogroup" aria-label={t("feedback_heading")}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} data-on={rating >= n ? "true" : "false"} onClick={() => setRating(n)} aria-label={digits(n, locale)}>
                <Star className="size-5" />
              </button>
            ))}
          </div>
          <textarea className="cafe-field" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("feedback_placeholder")} aria-label={t("feedback_placeholder")} rows={3} />
          <button type="button" className="cafe-primary-btn" onClick={() => void submitFeedback()}>
            {t("feedback_submit")}
          </button>
          {message ? <p className="cafe-ok">{message}</p> : null}
        </section>
      </div>
    </div>
  )
}
