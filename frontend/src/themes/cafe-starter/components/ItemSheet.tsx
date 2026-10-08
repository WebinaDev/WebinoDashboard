"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Check, Flame, Minus, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { trackAnalyticsEvent } from "@/lib/analytics-track"

import { useAddToCart } from "../lib/cart"
import { digits, keepQuery, localizedField, money, placeholderFor } from "../lib/helpers"
import type { ShopCurrencyDisplay } from "@/lib/format"
import type { CafeOrderingStatus, CatalogItem } from "../types"
import { CafeSheet } from "./CafeSheet"

/** Where each skin shows item details: phone skins use a bottom sheet, Super a side panel, MeNew a centered editorial card. */
export function sheetPlacement(skin: string): "bottom" | "side" | "center" {
  if (skin === "cafe-super") return "side"
  if (skin === "cafe-menew") return "center"
  return "bottom"
}

function defaultSelections(item: CatalogItem): Record<number, number[]> {
  const out: Record<number, number[]> = {}
  for (const mod of item.modifiers ?? []) {
    const defaults = mod.options.filter((o) => o.is_default).map((o) => o.id)
    if (defaults.length) out[mod.id] = defaults.slice(0, Math.max(1, mod.max_select))
    else if (mod.is_required && mod.max_select <= 1 && mod.options[0]) out[mod.id] = [mod.options[0].id]
  }
  return out
}

/** The slice of catalogue state the item panel needs; the full controller and the detail page both satisfy it. */
export type ItemCtx = {
  t: ((key: string, values?: Record<string, string | number>) => string)
  locale: string
  skin: string
  scheme: string
  currencyDisplay?: ShopCurrencyDisplay | null
  ordering?: CafeOrderingStatus | null
  qs: Record<string, string | null | undefined>
  tableNumber?: string | null
  branchSlug?: string | null
}

export function ItemSheet({
  ctrl,
  item,
  onClose,
}: {
  ctrl: ItemCtx
  item: CatalogItem | null
  onClose: () => void
}) {
  if (!item) return null
  return (
    <CafeSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={item.name}
      closeLabel={ctrl.t("close")}
      placement={sheetPlacement(ctrl.skin)}
      skin={ctrl.skin}
      scheme={ctrl.scheme}
      className="cafe-item-sheet"
      hideTitle
    >
      <ItemPanel ctrl={ctrl} item={item} onAdded={() => window.setTimeout(onClose, 900)} showMore />
    </CafeSheet>
  )
}

export function ItemPanel({
  ctrl,
  item,
  onAdded,
  showMore = false,
}: {
  ctrl: ItemCtx
  item: CatalogItem
  onAdded?: () => void
  showMore?: boolean
}) {
  const [qty, setQty] = useState(1)
  const [variant, setVariant] = useState<number | null>(null)
  const [selected, setSelected] = useState<Record<number, number[]>>({})
  const [added, setAdded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const add = useAddToCart(ctrl.tableNumber, ctrl.branchSlug)

  useEffect(() => {
    setQty(1)
    setAdded(false)
    setError(null)
    setVariant(item.variants?.find((v) => v.is_default)?.id ?? item.variants?.[0]?.id ?? null)
    setSelected(defaultSelections(item))
    trackAnalyticsEvent("product_view", { productId: item.id })
  }, [item])

  const unit = useMemo(() => {
    const v = item.variants?.find((row) => row.id === variant)
    const base = v
      ? item.discount_percent > 0
        ? Math.round((v.price_minor * (100 - item.discount_percent)) / 100)
        : v.price_minor
      : item.discounted_price_minor
    const extras = (item.modifiers ?? []).reduce((sum, mod) => {
      const ids = selected[mod.id] ?? []
      return sum + mod.options.filter((o) => ids.includes(o.id)).reduce((s, o) => s + o.price_minor, 0)
    }, 0)
    return base + extras
  }, [item, variant, selected])

  const missing = (item.modifiers ?? []).some((mod) => {
    const min = mod.is_required ? Math.max(1, mod.min_select) : mod.min_select
    return (selected[mod.id]?.length ?? 0) < min
  })

  const { t, locale } = ctrl
  const image = item.cover_image_url || item.image_url
  const currency = item.currency
  const fmt = (minor: number) => money(minor, currency, ctrl.currencyDisplay, locale)
  const blocked = item.is_sold_out || !item.is_available || ctrl.ordering?.accepting_orders === false

  function toggle(modId: number, optId: number, max: number) {
    setSelected((prev) => {
      const current = prev[modId] ?? []
      if (max <= 1) return { ...prev, [modId]: current.includes(optId) ? [] : [optId] }
      const next = current.includes(optId) ? current.filter((id) => id !== optId) : [...current, optId]
      return { ...prev, [modId]: next.slice(-max) }
    })
  }

  function submit() {
    setError(null)
    add.mutate(
      { productId: item.id, quantity: qty, optionIds: Object.values(selected).flat(), variantId: variant },
      {
        onSuccess: () => {
          setAdded(true)
          onAdded?.()
          window.setTimeout(() => setAdded(false), 1600)
        },
        onError: (e) => setError(getApiErrorMessage(e as Error)),
      },
    )
  }

  return (
      <div className="cafe-item-layout">
        <div className="cafe-item-hero" style={image ? undefined : { backgroundImage: placeholderFor(item.slug || item.name) }}>
          {item.video_url ? (
            <video src={item.video_url} autoPlay muted loop playsInline className="h-full w-full object-cover" />
          ) : image ? (
            <Image src={image} alt={item.name} fill className="object-cover" unoptimized />
          ) : null}
          {item.price_minor > item.discounted_price_minor ? (
            <span className="cafe-item-off">
              {t("discount_percent", {
                percent: digits(item.discount_percent || Math.round((1 - item.discounted_price_minor / item.price_minor) * 100), locale),
              })}
            </span>
          ) : null}
        </div>

        <div className="cafe-item-content">
          <div className="cafe-item-head">
            {item.category ? <p className="cafe-item-cat">{item.category.name}</p> : null}
            <h2 className="cafe-item-name">{item.name}</h2>
            <div className="cafe-item-tags">
              {item.is_featured ? <span>{t("badge_featured")}</span> : null}
              {item.is_new ? <span>{t("badge_new")}</span> : null}
              {item.calories ? <span>{t("calories", { count: digits(item.calories, locale) })}</span> : null}
              {(item.spice_level ?? 0) > 0 ? (
                <span>
                  <Flame className="inline size-3" /> {t("spice_level", { level: digits(item.spice_level ?? 0, locale) })}
                </span>
              ) : null}
              {item.allergens?.map((a) => (
                <span key={a.id}>{localizedField(locale, a.name_fa, a.name_en)}</span>
              ))}
            </div>
            {item.description ? <p className="cafe-item-desc">{item.description}</p> : null}
          </div>

          {item.variants && item.variants.length > 0 ? (
            <fieldset className="cafe-mod">
              <legend>{t("select_variant")}</legend>
              <div className="cafe-mod-options">
                {item.variants.map((v) => (
                  <button key={v.id} type="button" data-on={variant === v.id ? "true" : "false"} onClick={() => setVariant(v.id)}>
                    <span>{v.name}</span>
                    <small>{fmt(v.price_minor)}</small>
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}

          {item.modifiers?.map((mod) => (
            <fieldset key={mod.id} className="cafe-mod">
              <legend>
                {localizedField(locale, mod.name_fa, mod.name_en)}
                {mod.is_required ? <em>{t("required")}</em> : null}
              </legend>
              <div className="cafe-mod-options">
                {mod.options.map((opt) => {
                  const on = selected[mod.id]?.includes(opt.id) ?? false
                  return (
                    <button key={opt.id} type="button" data-on={on ? "true" : "false"} onClick={() => toggle(mod.id, opt.id, mod.max_select)}>
                      <span>{localizedField(locale, opt.name_fa, opt.name_en)}</span>
                      {opt.price_minor > 0 ? <small>+{fmt(opt.price_minor)}</small> : null}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          ))}

          {showMore ? (
            <Link className="cafe-item-more" href={`/catalogue/${item.slug}${keepQuery(ctrl.qs)}`}>
              {t("feedback_heading")}
            </Link>
          ) : null}
        </div>

        <div className="cafe-item-bar">
          <div className="cafe-stepper" aria-label={t("qty")}>
            <button type="button" onClick={() => setQty((q) => Math.min(50, q + 1))} aria-label={t("quick_add")}>
              <Plus className="size-4" />
            </button>
            <span>{digits(qty, locale)}</span>
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label={t("qty")} disabled={qty <= 1}>
              <Minus className="size-4" />
            </button>
          </div>
          <button
            type="button"
            className={cn("cafe-add-btn", added && "is-added")}
            disabled={blocked || missing || add.isPending}
            onClick={submit}
          >
            {added ? (
              <>
                <Check className="size-4" /> {t("added_to_cart")}
              </>
            ) : blocked ? (
              item.is_sold_out ? t(ctrl.skin === "cafe-super" ? "stock_gone" : "badge_sold_out") : t("orders_paused")
            ) : (
              <>
                <span>{t("add_to_cart")}</span>
                <span className="cafe-add-total">{fmt(unit * qty)}</span>
              </>
            )}
          </button>
        </div>
        {error ? <p className="cafe-error px-5 pb-3">{error}</p> : null}
      </div>
  )
}
