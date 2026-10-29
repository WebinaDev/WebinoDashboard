"use client"

import { ClassicAccountHome } from "@/themes/ecommerce-classic/components/ClassicPages"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import { StorefrontMegaMenuPanel, ProductReviewsPanel, ProductQuestionsPanel } from "../storefront/storefront-chrome"
import { StoreProductCard, StorefrontAccount } from "../storefront/ui"
import { addShopItem } from "../storefront/actions"
import { CartAddedModal, type CartAddedPayload } from "../storefront/cart-added-modal"
import { useCatalog } from "../storefront/use-catalog"
import { linkAttrs, propBool, propNum, propStr } from "../props"
import type { WidgetNode } from "../types"
import { useBuilderRuntime, useIsClassicSkin } from "./runtime"
import { ClassicBreadcrumbBar } from "@/themes/ecommerce-classic/components/ClassicArchive"
import { ClassicAmazingBand, ClassicBlogBlock, ClassicProductRow } from "@/themes/ecommerce-classic/components/ClassicHome"
import { Img } from "./img"

export function MegaMenuWidget({ widget }: { widget: WidgetNode }) {
  const columns = propStr(widget.props, "columns", "")
  return (
    <div className="mx-auto max-w-6xl px-4 py-2">
      <StorefrontMegaMenuPanel columnsText={columns} />
    </div>
  )
}

export function TasteBoxWidget({ widget }: { widget: WidgetNode }) {
  const title = propStr(widget.props, "title", "پیشنهاد برای سلیقه شما")
  const catalog = useCatalog(8)
  return (
    <section className="mx-auto max-w-6xl px-4 py-6">
      <div className="sf-section-head">
        <h2>{title}</h2>
        <Link href="/shop">مشاهده همه</Link>
      </div>
      <div className="sf-taste-grid">
        {catalog.products.slice(0, 4).map((product) => (
          <Link key={product.slug} href={`/product/${product.slug}`} className="sf-taste-card">
            <div className="mb-2 aspect-square overflow-hidden rounded-2xl bg-muted">
              {product.image ? (
                <Img src={product.image} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : null}
            </div>
            <span className="text-xs font-bold text-primary">{product.brand}</span>
            <span className="mt-1 line-clamp-2 text-sm font-extrabold">{product.name}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

export function PackageBlockWidget({ widget }: { widget: WidgetNode }) {
  const title = propStr(widget.props, "title", "پکیج ویژه")
  const text = propStr(widget.props, "text", "چند محصول مکمل با قیمت به‌صرفه")
  const href = propStr(widget.props, "href", "/shop")
  const catalog = useCatalog(4)
  const pack = catalog.products.slice(0, 4)
  return (
    <section className="mx-auto max-w-6xl px-4 py-6">
      <div className="sf-package">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">{text}</p>
          <Link href={href} {...linkAttrs(widget.props, "href")} className="mt-4 inline-flex rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground">
            مشاهده پکیج
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {pack.map((product) => (
            <Link key={product.slug} href={`/product/${product.slug}`} className="rounded-2xl bg-card p-3 text-center">
              <div className="mx-auto mb-2 size-14 overflow-hidden rounded-xl bg-muted">
                {product.image ? <Img src={product.image} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}
              </div>
              <span className="line-clamp-2 text-xs font-bold">{product.name}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

export function BlogTocWidget({ widget }: { widget: WidgetNode }) {
  const items = propStr(widget.props, "items", "مقدمه|#intro\nجمع‌بندی|#summary")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  return (
    <aside className="sf-blog-toc sf-card p-4">
      <h3 className="mb-2 text-sm font-bold">{propStr(widget.props, "title", "فهرست مطالب")}</h3>
      {items.map((line) => {
        const [label, href] = line.split("|").map((s) => s.trim())
        return (
          <a key={line} href={href || "#"}>
            {label}
          </a>
        )
      })}
    </aside>
  )
}

export function MostViewedWidget({ widget }: { widget: WidgetNode }) {
  const limit = propNum(widget.props, "limit", 6)
  const catalog = useCatalog(limit)
  const title = propStr(widget.props, "title", "پربازدیدترین")
  const classic = useIsClassicSkin()
  if (classic) return <ClassicProductRow title={title} products={catalog.products.slice(0, limit)} href="/shop?sort=featured" />
  return (
    <section className="mx-auto max-w-6xl px-4 py-6">
      <div className="sf-section-head">
        <h2>{title}</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {catalog.products.slice(0, limit).map((product) => (
          <StoreProductCard key={product.slug} product={product} />
        ))}
      </div>
    </section>
  )
}

export function AmazingHeaderWidget({ widget }: { widget: WidgetNode }) {
  const title = propStr(widget.props, "title", "پیشنهادهای شگفت‌انگیز")
  const text = propStr(widget.props, "text", "تخفیف‌های محدود امروز")
  const href = propStr(widget.props, "href", "/amazing-offers")
  return (
    <div className="sf-amazing-header mx-auto max-w-6xl px-4 py-6">
      <div className="sf-amazing-banner">
        <div>
          <p className="text-xs font-bold tracking-wide opacity-90">پیشنهاد ویژه</p>
          <h2 className="mt-1 text-2xl font-extrabold md:text-3xl">{title}</h2>
          <p className="mt-2 max-w-xl text-sm leading-7 opacity-90">{text}</p>
        </div>
        <Link href={href} {...linkAttrs(widget.props, "href")} className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[var(--sf-navy)]">
          مشاهده همه
        </Link>
      </div>
    </div>
  )
}

export function AmazingOffersBlockWidget({ widget }: { widget: WidgetNode }) {
  const t = useTranslations("storefront")
  const title = propStr(widget.props, "title", t("amazing_offers_title"))
  const catalog = useCatalog(8)
  const offers = catalog.products.filter((p) => p.compare && p.compare > p.price).slice(0, 4)
  const classic = useIsClassicSkin()
  if (classic) return <ClassicAmazingBand title={title} limit={propNum(widget.props, "limit", 0)} />
  return (
    <section className="mx-auto max-w-6xl px-4 py-6">
      <div className="sf-amazing-banner">
        <div>
          <p className="text-xs font-bold tracking-wide opacity-90">پیشنهاد ویژه</p>
          <h2 className="mt-1 text-2xl font-extrabold md:text-3xl">{title}</h2>
          <p className="mt-2 max-w-xl text-sm leading-7 opacity-90">{t("amazing_offers_hint")}</p>
        </div>
        <Link href="/amazing-offers" className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[var(--sf-navy)]">
          مشاهده همه
        </Link>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {offers.map((product) => (
          <StoreProductCard key={product.slug} product={product} />
        ))}
      </div>
    </section>
  )
}

export function BlogSliderWidget({ widget }: { widget: WidgetNode }) {
  const classic = useIsClassicSkin()
  if (classic) return <ClassicBlogBlock title={propStr(widget.props, "title", "مجله")} />
  return <DefaultBlogSlider widget={widget} />
}

function DefaultBlogSlider({ widget }: { widget: WidgetNode }) {
  const title = propStr(widget.props, "title", "از مجله ویبینو")
  const [posts, setPosts] = useState<Array<{ slug: string; title: string; excerpt?: string; cover_url?: string }>>([])
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    fetch(`${base}/api/v1/public/blog`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const items = Array.isArray(json?.data) ? json.data : Array.isArray(json?.data?.items) ? json.data.items : []
        setPosts(items.slice(0, 8))
      })
      .catch(() => setPosts([]))
  }, [])
  return (
    <section className="mx-auto max-w-6xl px-4 py-6">
      <div className="sf-section-head">
        <h2>{title}</h2>
        <Link href="/blog">مجله</Link>
      </div>
      <div className="sf-blog-slider">
        {posts.map((post) => (
          <Link key={post.slug} href={`/blog/${post.slug}`} className="sf-blog-slide">
            <div className="aspect-[16/10] overflow-hidden rounded-2xl bg-muted">
              {post.cover_url ? <Img src={post.cover_url} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}
            </div>
            <h3 className="mt-3 line-clamp-2 text-sm font-bold">{post.title}</h3>
            {post.excerpt ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{post.excerpt}</p> : null}
          </Link>
        ))}
      </div>
    </section>
  )
}

export function ProductGalleryWidget({ productSlug, editing = false }: { productSlug?: string; editing?: boolean }) {
  const runtime = useBuilderRuntime()
  const slug = productSlug || runtime.productSlug
  const catalog = useCatalog(24)
  // Live pages show only the requested product; the first product is a preview stand-in in the editor only.
  const product = catalog.products.find((item) => item.slug === slug) ?? (editing ? catalog.products[0] : undefined)
  const [active, setActive] = useState(0)
  if (!product) return <p className="p-4 text-sm text-muted-foreground">گالری محصول</p>
  const gallery = product.images?.length ? product.images : product.image ? [product.image] : []
  const current = gallery[active] || product.image
  return (
    <div className="mx-auto max-w-xl px-4 py-4">
      <div className="sf-widget-gallery">
        <div className="aspect-square overflow-hidden rounded-[28px] border border-border bg-card">
          {current ? (
            <Img src={current} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-sm font-bold text-muted-foreground">{product.brand}</div>
          )}
        </div>
        {gallery.length > 1 ? (
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {gallery.map((src, index) => (
              <button
                key={src + index}
                type="button"
                onClick={() => setActive(index)}
                className={`h-16 w-16 overflow-hidden rounded-2xl border ${index === active ? "border-primary" : "border-border"}`}
              >
                <Img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function AddToCartBoxWidget({ productSlug, editing = false }: { productSlug?: string; editing?: boolean }) {
  const runtime = useBuilderRuntime()
  const slug = productSlug || runtime.productSlug
  const catalog = useCatalog(24)
  const tCart = useTranslations("cart")
  const t = useTranslations("storefront")
  const locale = useLocale()
  const product = catalog.products.find((item) => item.slug === slug) ?? (editing ? catalog.products[0] : undefined)
  const [note, setNote] = useState("")
  const [atcOpen, setAtcOpen] = useState(false)
  const [atcItem, setAtcItem] = useState<CartAddedPayload | null>(null)
  const [atcError, setAtcError] = useState<string | null>(null)
  if (!product) return null
  const money = `${formatNumber(Math.round(product.price), normalizeUiLocale(locale))} ${t("currency_toman")}`
  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <div className="sf-atc-box sf-card p-5">
        <p className="text-xs font-bold text-primary">{product.brand}</p>
        <h3 className="mt-1 text-lg font-extrabold">{product.name}</h3>
        <p className="mt-3 text-2xl font-bold">{money}</p>
        <p className="mt-1 text-xs text-muted-foreground">{product.inStock ? t("stock_in") : t("stock_out")}</p>
        <button
          type="button"
          disabled={!product.inStock}
          className="mt-4 w-full rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          onClick={() =>
            void addShopItem(product).then((r) => {
              if (r === "error") {
                setNote(t("add_failed"))
                setAtcError(t("add_failed"))
                setAtcItem(null)
                setAtcOpen(true)
                return
              }
              setNote("")
              setAtcError(null)
              setAtcItem({
                name: product.name,
                image: product.image,
                priceLabel: money,
                quantity: 1,
              })
              setAtcOpen(true)
            })
          }
        >
          {tCart("add_to_cart")}
        </button>
        {note ? <p className="mt-2 text-xs text-muted-foreground">{note}</p> : null}
      </div>
      <CartAddedModal open={atcOpen} item={atcItem} error={atcError} onClose={() => setAtcOpen(false)} />
    </div>
  )
}

export function ProductReviewsWidget({ widget, productSlug, editing = false }: { widget: WidgetNode; productSlug?: string; editing?: boolean }) {
  const slug = productSlug || propStr(widget.props, "slug", "")
  if (!slug) return editing ? <p className="mx-auto max-w-6xl rounded-xl border border-dashed p-4 text-sm text-foreground/60">دیدگاه‌ها در صفحه محصول نمایش داده می‌شوند (یا نامک محصول را وارد کنید).</p> : null
  const p = widget.props
  return (
    <div className="mx-auto max-w-6xl px-4">
      <ProductReviewsPanel
        slug={slug}
        options={{
          title: propStr(p, "title", ""),
          intro: propStr(p, "intro", ""),
          showAverage: propBool(p, "showAverage", true),
          allowSubmit: propBool(p, "allowSubmit", false),
          submitLabel: propStr(p, "submitLabel", "ثبت دیدگاه"),
          emptyText: propStr(p, "emptyText", "ندارد"),
          limit: propNum(p, "limit", 0),
          editing,
        }}
      />
    </div>
  )
}

export function ProductQuestionsWidget({ widget, productSlug }: { widget: WidgetNode; productSlug?: string }) {
  const slug = productSlug || propStr(widget.props, "slug", "")
  if (!slug) return null
  return (
    <div className="mx-auto max-w-6xl px-4">
      <ProductQuestionsPanel slug={slug} />
    </div>
  )
}

export function AccountDashboardWidget() {
  const classic = useIsClassicSkin()
  if (classic) return <ClassicAccountHome />
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <StorefrontAccount />
    </div>
  )
}

export function BreadcrumbsWidget({ widget }: { widget: WidgetNode }) {
  const items = propStr(widget.props, "trail", "خانه|/\nفروشگاه|/shop")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, href] = line.split("|").map((s) => s.trim())
      return { label: label || "", href: href || undefined }
    })
  const classic = useIsClassicSkin()
  if (classic) return <ClassicBreadcrumbBar items={items} />
  return (
    <nav className="sf-breadcrumb mx-auto max-w-6xl px-4 pt-4" aria-label="breadcrumb">
      {items.map((item, i) => (
        <span key={item.label + i}>
          {i > 0 ? " / " : null}
          {item.href ? <Link href={item.href}>{item.label}</Link> : item.label}
        </span>
      ))}
    </nav>
  )
}
