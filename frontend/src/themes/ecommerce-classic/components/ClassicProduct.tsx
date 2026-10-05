"use client"

import { useClassicThemeSettings } from "@/themes/shared/site-branding-context"

import Link from "next/link"
import { useEffect, useState } from "react"

import { InstallmentBadges } from "@/components/payments/InstallmentBadges"
import { trackAnalyticsEvent } from "@/lib/analytics-track"
import { mapApiProduct, toneClass, type ShopProduct } from "@/builder/catalog"
import { addShopItem } from "@/builder/storefront/actions"
import { quietApi } from "@/builder/storefront/session"
import { StockAlertForm } from "@/builder/storefront/storefront-chrome"
import { ProductPriceHistory } from "@/builder/storefront/storefront-extras"
import { useCatalog } from "@/builder/storefront/use-catalog"

import { ClassicBreadcrumbBar } from "./ClassicArchive"
import {
  IconBadge,
  IconBell,
  IconCard,
  IconChart,
  IconChevronLeft,
  IconClose,
  IconCompare,
  IconEye,
  IconHeart,
  IconInfo,
  IconMinus,
  IconPlus,
  IconShare,
  IconShield,
  IconTruck,
} from "./icons"
import { promoStatsForProduct } from "@/themes/ecommerce-classic/lib/classic-chrome"
import { ClassicAmount, ClassicRating, rememberViewedProduct, useDigits } from "./parts"

export function ClassicTrustStrip() {
  const items = [
    { icon: <IconTruck size={22} />, title: "ارسال سریع", text: "امکان تحویل اکسپرس" },
    { icon: <IconCard size={22} />, title: "پرداخت", text: "امکان پرداخت اقساطی" },
    { icon: <IconShield size={22} />, title: "ضمانت", text: "هفت روز ضمانت بازگشت کالا" },
    { icon: <IconBadge size={22} />, title: "اصالت", text: "تضمین اصالت و اورجینال بودن کالا" },
  ]
  return (
    <div className="sfc-trust">
      {items.map((item) => (
        <div key={item.title} className="sfc-trust__item">
          <span className="sfc-trust__icon">{item.icon}</span>
          <div>
            <strong>{item.title}</strong>
            <span>{item.text}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function Stepper({ qty, max, onChange }: { qty: number; max: number; onChange: (qty: number) => void }) {
  const digits = useDigits()
  return (
    <div className="sfc-stepper">
      <button type="button" aria-label="افزایش تعداد" onClick={() => onChange(Math.min(max, qty + 1))}>
        <IconPlus size={16} />
      </button>
      <span className="sfc-stepper__value" aria-live="polite">
        {digits(qty)}
      </span>
      <button type="button" aria-label="کاهش تعداد" onClick={() => onChange(Math.max(1, qty - 1))}>
        <IconMinus size={16} />
      </button>
    </div>
  )
}

export function ClassicProduct({ slug, editing }: { slug?: string; editing: boolean }) {
  const digits = useDigits()
  const theme = useClassicThemeSettings()
  const commerce = theme.commerce ?? {}
  const showShare = commerce.product_share !== false
  const showCompare = commerce.compare_enabled !== false
  const showRating = commerce.show_rating !== false
  const showStickyMobile = commerce.sticky_cart_mobile !== false && theme.sticky_add_to_cart !== false
  const showStickyDesktop = Boolean(commerce.sticky_cart_desktop)
  const stickySide = String(commerce.sticky_cart_side || "bottom")
  const lightboxEnabled = commerce.gallery_lightbox !== false
  const thumbsLayout = String(commerce.gallery_thumbs || theme.pdp_gallery_style || "bottom")
  const showFakeStats = Boolean(commerce.fake_stats_enabled)
  const showInstallmentBox = commerce.installment_enabled !== false
  const showShipping = commerce.shipping_text_enabled !== false
  const catalog = useCatalog(8)
  const [remote, setRemote] = useState<ShopProduct | null | undefined>(undefined)
  const [qty, setQty] = useState(1)
  const [image, setImage] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const [variantId, setVariantId] = useState<number | null>(null)
  const [tab, setTab] = useState<"desc" | "spec" | "faq">("desc")
  const [liked, setLiked] = useState(false)
  const [note, setNote] = useState("")
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!slug) {
      setRemote(null)
      return
    }
    let cancel = false
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    fetch(`${base}/api/v1/public/catalog/items/${encodeURIComponent(slug)}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: Record<string, unknown> } | null) => {
        if (cancel) return
        setRemote(json?.data && typeof json.data === "object" ? mapApiProduct(json.data, 0) : null)
      })
      .catch(() => {
        if (!cancel) setRemote(null)
      })
    return () => {
      cancel = true
    }
  }, [slug])

  const fallback = catalog.products.find((item) => item.slug === slug) ?? (catalog.live ? null : catalog.products[0] ?? null)
  const product = remote === undefined ? fallback : (remote ?? fallback)

  useEffect(() => {
    if (editing || !product?.slug) return
    rememberViewedProduct(product.slug)
    if (product.id) trackAnalyticsEvent("product_view", { productId: product.id })
  }, [editing, product?.id, product?.slug])

  const galleryLen = product
    ? (product.images.length ? product.images.length : product.image ? 1 : 0)
    : 0

  useEffect(() => {
    if (!lightbox) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightbox(false)
      if (event.key === "ArrowRight" && galleryLen) setImage((i) => (i + 1) % galleryLen)
      if (event.key === "ArrowLeft" && galleryLen) setImage((i) => (i - 1 + galleryLen) % galleryLen)
    }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [lightbox, galleryLen])

  if (!product) {
    return <p className="sfc-container sfc-empty-note">محصولی پیدا نشد.</p>
  }

  const variant = product.variants.find((item) => item.id === variantId) ?? null
  const gallery = product.images.length ? product.images : product.image ? [product.image] : []
  const activeImage = variant?.image || gallery[image] || product.image
  const blocked = !product.inStock || (variant ? !variant.inStock : false)
  const price = variant?.price || product.price
  const compare = variant ? variant.compare : product.compare
  const off = compare && compare > price ? Math.round((1 - price / compare) * 100) : 0
  const stock = variant ? variant.stock : (product.stock ?? null)
  const maxQty = typeof stock === "number" && stock > 0 ? Math.min(stock, 99) : 99
  const promo = showFakeStats
    ? promoStatsForProduct(product.id || product.slug, {
        factor: Number(commerce.fake_stats_factor ?? 1),
        sensitivity: Number(commerce.fake_stats_sensitivity ?? 5),
      })
    : null

  function add() {
    if (editing || blocked || !product) return
    trackAnalyticsEvent("add_to_cart", { productId: product.id })
    void addShopItem(product, qty).then((result) => setNote(result === "error" ? "افزودن ناموفق بود." : "به سبد خرید افزوده شد."))
  }

  const attrs: { label: string; value: string }[] = [
    { label: "برند", value: product.brand },
    { label: "دسته‌بندی", value: product.category },
    { label: "وضعیت", value: product.inStock ? "موجود در انبار" : "ناموجود" },
  ]
  if (typeof stock === "number") attrs.push({ label: "موجودی", value: `${digits(stock)} عدد` })
  if (product.variants.length) attrs.push({ label: "تنوع", value: `${digits(product.variants.length)} مدل` })

  return (
    <div className="sfc-pdp">
      <ClassicBreadcrumbBar
        items={[
          { label: "خانه", href: "/" },
          { label: "فروشگاه", href: "/shop" },
          { label: product.category, href: product.categorySlug ? `/shop?category=${product.categorySlug}` : "/shop" },
          { label: product.name },
        ]}
      />
      <div className="sfc-container sfc-pdp__grid">
        <div className="sfc-pdp__main">
          <header className="sfc-pdp__head">
            <div className="sfc-pdp__tags">
              <Link href={product.categorySlug ? `/shop?category=${product.categorySlug}` : "/shop"} className="sfc-tag">
                {product.category}
              </Link>
              <Link href={`/shop?brand=${encodeURIComponent(product.brandSlug)}`} className="sfc-tag sfc-tag--alt">
                {product.brand}
              </Link>
              {product.isNew ? <span className="sfc-tag sfc-tag--pink">جدید</span> : null}
            </div>
            <h1 className="sfc-pdp__title">{product.name}</h1>
            <p className="sfc-pdp__sub">{product.brand}</p>
          </header>

          <div className="sfc-pdp__body">
            <aside className="sfc-pdp__rail" aria-label="ابزارهای محصول">
              <span className="sfc-pdp__rail-rating">
                {showRating ? <ClassicRating value={product.rating} /> : null}
              </span>
              <button
                type="button"
                aria-label="علاقه‌مندی"
                aria-pressed={liked}
                className={liked ? "is-on" : ""}
                onClick={() => {
                  setLiked((v) => !v)
                  if (product.id) void quietApi(`/api/v1/account/favorites/${product.id}`, { method: "POST" })
                }}
              >
                <IconHeart size={20} filled={liked} />
              </button>
              {showShare ? (
                <button
                  type="button"
                  aria-label="اشتراک‌گذاری"
                  onClick={() => {
                    const url = typeof window !== "undefined" ? window.location.href : ""
                    if (navigator.share) void navigator.share({ title: product.name, url }).catch(() => undefined)
                    else void navigator.clipboard?.writeText(url)
                  }}
                >
                  <IconShare size={20} />
                </button>
              ) : null}
              <a href="#sfc-stock-alert" aria-label="اطلاع از موجودی">
                <IconBell size={20} />
              </a>
              {showCompare ? (
                <button
                  type="button"
                  aria-label="افزودن به مقایسه"
                  onClick={() => product.id && void quietApi(`/api/v1/public/compare/products/${product.id}`, { method: "POST" })}
                >
                  <IconCompare size={20} />
                </button>
              ) : null}
              <a href="#sfc-price-chart" aria-label="نمودار قیمت">
                <IconChart size={20} />
              </a>
            </aside>

            <div className={`sfc-pdp__gallery ${thumbsLayout === "side" ? "sfc-pdp__gallery--side" : "sfc-pdp__gallery--bottom"}`}>
              <div className="sfc-pdp__image">
                {activeImage ? (
                  lightboxEnabled ? (
                    <button
                      type="button"
                      className="sfc-pdp__image-btn"
                      onClick={() => setLightbox(true)}
                      aria-label="بزرگ‌نمایی تصویر"
                    >
                      <img src={activeImage} alt={product.name} />
                    </button>
                  ) : (
                    <img src={activeImage} alt={product.name} />
                  )
                ) : (
                  <span className={`sfc-pdp__ph bg-gradient-to-br ${toneClass(product.tone)}`}>{product.brand}</span>
                )}
                {off > 0 ? <span className="sfc-pdp__off">{digits(off)}٪</span> : null}
              </div>
              {gallery.length > 1 ? (
                <div className="sfc-pdp__thumbs">
                  {gallery.map((src, index) => (
                    <button
                      key={src + index}
                      type="button"
                      onClick={() => setImage(index)}
                      className={index === image ? "is-active" : ""}
                      aria-label={`تصویر ${digits(index + 1)}`}
                    >
                      <img src={src} alt="" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="sfc-pdp__info">
              <div className="sfc-attrs">
                {showRating ? (
                  <a href="#sfc-reviews" className="sfc-attr sfc-attr--rating">
                    <span className="sfc-attr__label">امتیاز و دیدگاه</span>
                    <ClassicRating value={product.rating} />
                    <IconChevronLeft size={16} className="sfc-attr__chev" />
                  </a>
                ) : null}
                {attrs.map((a) => (
                  <div key={a.label} className="sfc-attr">
                    <span className="sfc-attr__label">{a.label}</span>
                    <span className="sfc-attr__value">{a.value}</span>
                  </div>
                ))}
              </div>
              {promo ? (
                <p className="sfc-pdp__promo-stats" title="نمایش تشویقی — آمار واقعی فروشگاه نیست">
                  <IconEye size={16} />
                  <span>
                    {digits(promo.views)} بازدید · {digits(promo.sold)} فروش نمایشی
                  </span>
                  <em>نمایش تشویقی</em>
                </p>
              ) : null}

              {product.variants.length ? (
                <div className="sfc-pdp__variants">
                  <span className="sfc-divider-title">انتخاب مدل</span>
                  <div className="sfc-pdp__variant-list">
                    {product.variants.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        disabled={!item.inStock}
                        onClick={() => setVariantId(item.id)}
                        className={variantId === item.id ? "is-active" : ""}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <span className="sfc-divider-title">مشاهده ویژگی‌های محصول</span>
              <p className={`sfc-pdp__desc ${expanded ? "is-open" : ""}`}>{product.description}</p>
              <button type="button" className="sfc-divider-title sfc-divider-title--btn" onClick={() => setExpanded((v) => !v)}>
                {expanded ? "بستن توضیحات" : "مشاهده توضیحات محصول"}
              </button>

              <div className="sfc-notice">
                <IconInfo size={18} />
                <span>امکان برگشت کالا در گروه آرایشی و بهداشتی با دلیل «انصراف از خرید» تنها در صورتی مورد قبول است که پلمب کالا باز نشده باشد.</span>
              </div>

              {!product.inStock ? (
                <div id="sfc-stock-alert">
                  <StockAlertForm slug={product.slug} />
                </div>
              ) : null}
            </div>
          </div>

          <div className="sfc-pdp__report">
            <span>
              <IconInfo size={16} /> قیمت بهتری سراغ دارید؟ اعلام کنید
            </span>
            <span>
              <IconInfo size={16} /> گزارش مشخصات کالا یا موارد قانونی
            </span>
          </div>

          <ClassicTrustStrip />

          <div className="sfc-tabs" id="sfc-tabs">
            <div className="sfc-tabs__head">
              <h2 className="sfc-tabs__title">{tab === "desc" ? "توضیحات" : tab === "spec" ? "مشخصات" : "پرسش‌ها"}</h2>
              <div className="sfc-tabs__links" role="tablist">
                {(
                  [
                    ["desc", "توضیحات"],
                    ["spec", "توضیحات تکمیلی"],
                    ["faq", "پرسش‌ها"],
                  ] as const
                ).map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}>
                    {label}
                  </button>
                ))}
                <a href="#sfc-reviews">نظرات</a>
              </div>
            </div>
            <div className="sfc-tabs__body">
              {tab === "spec" ? (
                <dl className="sfc-spec">
                  {attrs.map((a) => (
                    <div key={a.label}>
                      <dt>{a.label}</dt>
                      <dd>{a.value}</dd>
                    </div>
                  ))}
                  {product.variants.map((item) => (
                    <div key={item.id}>
                      <dt>{item.name}</dt>
                      <dd>{item.inStock ? "موجود" : "ناموجود"}</dd>
                    </div>
                  ))}
                </dl>
              ) : tab === "faq" ? (
                product.faqs.length ? (
                  <div className="sfc-faq">
                    {product.faqs.map((row) => (
                      <details key={row.question}>
                        <summary>{row.question}</summary>
                        <p>{row.answer}</p>
                      </details>
                    ))}
                  </div>
                ) : (
                  <p className="sfc-empty-note">هنوز پرسشی ثبت نشده است.</p>
                )
              ) : (
                <div className="sfc-prose">
                  <h3>نقد و بررسی</h3>
                  <p>{product.description}</p>
                </div>
              )}
            </div>
          </div>
          <div id="sfc-price-chart">
            <ProductPriceHistory slug={product.slug} />
          </div>
        </div>

        <aside className="sfc-pdp__buy">
          <div className="sfc-buy">
            <div className="sfc-buy__row sfc-buy__row--ok">
              <IconShield size={18} />
              <span>۷ روز ضمانت بازگشت بی قید و شرط</span>
            </div>
            <div className="sfc-buy__row">
              <span className={`sfc-dot ${product.inStock ? "is-ok" : "is-out"}`} aria-hidden="true" />
              <span>{product.inStock ? "موجود در انبار" : "ناموجود"}</span>
            </div>
            {typeof stock === "number" ? (
              <div className="sfc-buy__split">
                <span>
                  باقی مانده: <b>{digits(stock)}</b>
                </span>
              </div>
            ) : null}
            {showInstallmentBox && product.installments.length ? (
              <div className="sfc-buy__installments">
                {product.installments.slice(0, 2).map((plan) => (
                  <span key={plan.months}>
                    {digits(plan.months)} قسط ماهانه <ClassicAmount value={plan.monthly} />
                  </span>
                ))}
              </div>
            ) : null}
            <InstallmentBadges productId={product.id} amountMinor={price} />
            <Stepper qty={qty} max={maxQty} onChange={setQty} />
            <button type="button" className="sfc-btn sfc-btn--block sfc-btn--lg" disabled={editing || blocked} onClick={add}>
              {blocked ? "ناموجود" : "افزودن به سبد خرید"}
            </button>
            {note ? <p className="sfc-buy__note">{note}</p> : null}
            <div className="sfc-buy__price">
              {off > 0 ? (
                <div className="sfc-buy__old">
                  <del>{digits(compare ?? 0)}</del>
                  <span className="sfc-price__off">{digits(off)}٪</span>
                </div>
              ) : null}
              <ClassicAmount value={price} className="sfc-buy__now" />
            </div>
            {product.cashPrice && product.cashPrice !== price ? (
              <p className="sfc-buy__cash">
                قیمت نقدی: <ClassicAmount value={product.cashPrice} />
              </p>
            ) : null}
          </div>
        </aside>
      </div>



      {Array.isArray(commerce.features) && commerce.features.length ? (
        <div className="sfc-container sfc-pdp__features">
          {commerce.features.map((f, i) => (
            <div key={i} className="sfc-pdp__feature">
              <strong>{String(f.title ?? "")}</strong>
              <span>{String(f.text ?? "")}</span>
            </div>
          ))}
        </div>
      ) : null}
      {showShipping && commerce.shipping_text ? (
        <div className="sfc-container sfc-pdp__shipping-note">
          <p>{commerce.shipping_text}</p>
        </div>
      ) : null}
      {showInstallmentBox && (commerce.installment_title || commerce.installment_text) ? (
        <div className="sfc-container sfc-pdp__installment-box">
          {commerce.installment_title ? <strong>{commerce.installment_title}</strong> : null}
          {commerce.installment_text ? <p>{commerce.installment_text}</p> : null}
          {commerce.installment_link ? (
            <a href={commerce.installment_link}>راهنمای خرید اقساطی</a>
          ) : null}
        </div>
      ) : null}
      {showStickyMobile || showStickyDesktop ? (
        <div
          className={[
            "sf-sticky-cta sfc-sticky-cta",
            showStickyMobile ? "sfc-sticky-cta--mobile" : "",
            showStickyDesktop ? "sfc-sticky-cta--desktop" : "",
            stickySide === "left" ? "sfc-sticky-cta--side-left" : "",
            stickySide === "right" ? "sfc-sticky-cta--side-right" : "sfc-sticky-cta--side-bottom",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <ClassicAmount value={price} className="sfc-buy__now" />
          <button type="button" disabled={editing || blocked} onClick={add} className="sfc-btn">
            افزودن به سبد خرید
          </button>
        </div>
      ) : null}

      {lightbox && lightboxEnabled && activeImage ? (
        <div
          className="sfc-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="گالری محصول"
          onClick={() => setLightbox(false)}
        >
          <button type="button" className="sfc-lightbox__close" aria-label="بستن" onClick={() => setLightbox(false)}>
            <IconClose size={22} />
          </button>
          <div className="sfc-lightbox__stage" onClick={(event) => event.stopPropagation()}>
            <img src={activeImage} alt={product.name} />
            {gallery.length > 1 ? (
              <div className="sfc-lightbox__thumbs">
                {gallery.map((src, index) => (
                  <button
                    key={src + index}
                    type="button"
                    className={index === image ? "is-active" : ""}
                    onClick={() => setImage(index)}
                    aria-label={`تصویر ${digits(index + 1)}`}
                  >
                    <img src={src} alt="" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
