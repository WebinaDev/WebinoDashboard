"use client"
import { OptImg } from "@/components/perf/OptImg"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { addShopItem } from "@/builder/storefront/actions"
import { quietApi } from "@/builder/storefront/session"
import { productCardSrcSet, toneClass, type ShopProduct } from "@/builder/catalog"

import { IconHeart } from "./icons"
import { promoStatsForProduct } from "@/themes/ecommerce-classic/lib/classic-chrome"
import { ClassicPrice, ClassicRating, useDigits } from "./parts"
import { useClassicThemeSettings } from "@/themes/shared/site-branding-context"
import { useClassicText } from "../lib/texts"

/**
 * Classic product card anatomy:
 * wishlist (top-start) · labels · square contained image · 2-line title ·
 * stock + rating row · price (old/percent/now + toman) · pink CTA.
 */
export function ClassicProductCard({
  product,
  variant = "slider",
}: {
  product: ShopProduct
  variant?: "slider" | "archive" | "mini"
}) {
  const tx = useClassicText()
  const digits = useDigits()
  const theme = useClassicThemeSettings()
  const commerce = theme.commerce ?? {}
  const showRating = commerce.show_rating !== false
  const showCardAtc = commerce.card_add_to_cart !== false
  const showInstallment = commerce.card_installment_enabled !== false && (theme.show_installment_badge !== false)
  const showFakeStats = Boolean(commerce.fake_stats_enabled)
  const wishlistEnabled = commerce.wishlist_enabled !== false
  const ajaxAdd = commerce.ajax_add_to_cart !== false
  const cardStyle = ["minimal", "bordered", "compact"].includes(String(theme.product_card_style ?? "")) ? String(theme.product_card_style) : "classic"
  const installmentImage = String(commerce.card_installment_image || "").trim()
  const router = useRouter()
  const promo = showFakeStats
    ? promoStatsForProduct(product.id || product.slug, {
        factor: Number(commerce.fake_stats_factor ?? 1),
        sensitivity: Number(commerce.fake_stats_sensitivity ?? 5),
      })
    : null
  const [liked, setLiked] = useState(false)
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle")
  const href = `/product/${product.slug}`
  const variable = product.variants.length > 0
  const stockLabel = !product.inStock
    ? tx("card.out_of_stock")
    : typeof product.stock === "number" && product.stock > 0
      ? `${digits(product.stock)} عدد در انبار`
      : tx("card.in_stock")

  return (
    <article className={`sfc-card sf-product-card sfc-card--${variant} sfc-card--style-${cardStyle}`} data-card-style={cardStyle}>
      <div className="sfc-card__inner">
        {wishlistEnabled ? (
        <button
          type="button"
          aria-label="افزودن به علاقه‌مندی"
          aria-pressed={liked}
          className={`sfc-card__wish ${liked ? "is-on" : ""}`}
          onClick={() => {
            setLiked((value) => !value)
            if (product.id) void quietApi(`/api/v1/account/favorites/${product.id}`, { method: "POST" })
          }}
        >
          <IconHeart size={20} filled={liked} />
        </button>
        ) : null}
        <div className="sfc-card__labels">
          {product.isNew ? <span className="sfc-card__label">{tx("card.new_badge")}</span> : null}
          {!product.inStock ? <span className="sfc-card__label sfc-card__label--muted">{tx("card.out_of_stock")}</span> : null}
          {showInstallment && product.inStock ? (
            <span className="sfc-card__label sfc-card__label--installment">
              {installmentImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <OptImg src={installmentImage} alt="" className="sfc-card__installment-img" loading="lazy" />
              ) : null}
              {commerce.card_installment_text || "اقساطی"}
            </span>
          ) : null}
        </div>
        <Link href={href} className="sfc-card__image" tabIndex={-1} aria-hidden="true">
          {product.image ? (
            <OptImg src={product.image} {...productCardSrcSet(product)} alt="" loading="lazy" decoding="async" />
          ) : (
            <span className={`sfc-card__ph bg-gradient-to-br ${toneClass(product.tone)}`}>{product.brand}</span>
          )}
        </Link>
        <h3 className="sfc-card__title">
          <Link href={href}>{product.name}</Link>
        </h3>
        <div className="sfc-card__detail">
          <span className={`sfc-card__stock ${product.inStock ? "" : "is-out"}`}>{stockLabel}</span>
          {showRating ? <ClassicRating value={product.rating} /> : null}
        </div>
        {promo ? (
          <p className="sfc-card__promo-stats" title="نمایش تشویقی">
            {digits(promo.sold)}+ فروش نمایشی
          </p>
        ) : null}
        <div className="sfc-card__actions">
          <div className="sfc-card__price">
            {product.inStock ? (
              <ClassicPrice price={product.price} compare={product.compare} />
            ) : (
              <span className="sfc-card__soldout">{tx("card.out_of_stock")}</span>
            )}
          </div>
          {showCardAtc ? (
            variable || !product.inStock ? (
              <Link href={href} className="sfc-btn sfc-btn--card">
                {tx("card.view_product")}
              </Link>
            ) : (
              <button
                type="button"
                className="sfc-btn sfc-btn--card"
                disabled={state === "busy"}
                onClick={() => {
                  setState("busy")
                  void addShopItem(product).then((result) => {
                    setState(result === "error" ? "error" : "done")
                    if (result !== "error" && !ajaxAdd) router.push("/cart")
                  })
                }}
              >
                {state === "done" ? "افزوده شد" : state === "error" ? "خطا، دوباره" : "افزودن به سبد"}
              </button>
            )
          ) : null}
        </div>
      </div>
    </article>
  )
}
