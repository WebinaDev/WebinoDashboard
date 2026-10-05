"use client"

import DOMPurify from "dompurify"
import { Heart, ShieldCheck, Sparkles, Star, Truck } from "lucide-react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"

import { embedVideoSrc, sanitizeBuilderHtml } from "./sanitize-html"
import {
  SAMPLE_BRANDS,
  toneClass,
  type ShopProduct,
} from "../catalog"
import { useCatalog } from "../storefront/use-catalog"
import {
  AccountDashboardWidget,
  AddToCartBoxWidget,
  AmazingHeaderWidget,
  AmazingOffersBlockWidget,
  BlogSliderWidget,
  BlogTocWidget,
  BreadcrumbsWidget,
  MegaMenuWidget,
  MostViewedWidget,
  PackageBlockWidget,
  ProductGalleryWidget,
  ProductReviewsWidget,
  TasteBoxWidget,
} from "./classic-widgets"
import {
  StoreFilters,
  StoreProductCard,
  StorefrontAccount,
  StorefrontCart,
  StorefrontCheckout,
  StorefrontFooter,
  StorefrontHeader,
  StorefrontProduct,
} from "../storefront/ui"
import { fillDocumentTokens } from "../theme/tokens"
import { propBool, propNum, propStr, parseLinks } from "../props"
import type { BuilderDocument, EditorApi, WidgetNode } from "../types"
import { BuilderRuntimeProvider, useBuilderGlobals, useBuilderRuntime } from "./runtime"

const NAV = [
  { label: "خانه", href: "/" },
  { label: "فروشگاه", href: "/shop" },
  { label: "تازه‌ها", href: "/shop?sort=new" },
  { label: "مجله", href: "/blog" },
  { label: "درباره", href: "/pages/about" },
]

function useMoney() {
  const t = useTranslations("builder")
  const locale = useLocale()
  return (amount: number) => `${formatNumber(Math.max(0, Math.round(amount)), normalizeUiLocale(locale))} ${t("currency_toman")}`
}

function AbstractArt({ tone, label }: { tone: string; label: string }) {
  return (
    <div className={`relative grid h-full w-full place-items-center bg-gradient-to-br ${toneClass(tone)}`}>
      <span className="absolute -start-6 top-6 size-24 rounded-full bg-white/40" />
      <span className="absolute end-4 bottom-4 size-16 rounded-full bg-foreground/10" />
      <span className="relative text-sm font-bold text-foreground/80">{label}</span>
    </div>
  )
}

export function WidgetBody({ widget, editor }: { widget: WidgetNode; editor?: EditorApi }) {
  const runtime = useBuilderRuntime()
  const editing = Boolean(editor)
  switch (widget.type) {
    case "heading":
      return <HeadingWidget widget={widget} editor={editor} />
    case "text":
      return <TextWidget widget={widget} editor={editor} />
    case "image":
      return <ImageWidget widget={widget} />
    case "button":
      return <ButtonWidget widget={widget} />
    case "spacer":
      return <div style={{ height: propNum(widget.props, "size", 32) }} />
    case "divider":
      return <hr className="border-0 border-t" style={{ borderColor: propStr(widget.props, "color", "var(--color-border)") }} />
    case "icon":
      return <IconWidget widget={widget} />
    case "video":
      return <VideoWidget widget={widget} />
    case "html":
      return <HtmlWidget widget={widget} />
    case "menu":
      return <MenuWidget widget={widget} />
    case "form":
      return <FormWidget widget={widget} />
    case "hero-slider":
      return <HeroWidget />
    case "category-grid":
      return <CategoryWidget widget={widget} />
    case "product-grid":
      return <ProductGridWidget widget={widget} editing={editing} />
    case "product-card":
      return <SingleCard widget={widget} />
    case "promo-banner":
      return <PromoWidget widget={widget} />
    case "deal-bar":
      return <DealBar widget={widget} />
    case "countdown":
      return <CountdownWidget widget={widget} />
    case "trust-badges":
      return <TrustWidget />
    case "newsletter":
      return <NewsletterWidget widget={widget} />
    case "brand-row":
      return <BrandRow widget={widget} />
    case "blog-teasers":
      return <BlogWidget widget={widget} />
    case "filter-panel":
      return <FilterWidget editing={editing} />
    case "product-detail":
      return <ProductDetail editing={editing} slug={runtime.productSlug} />
    case "cart-lines":
      return <CartWidget />
    case "checkout-stub":
      return <CheckoutWidget />
    case "account-stub":
      return <AccountWidget />
    case "amazing-offers":
      return <AmazingOffersBlockWidget widget={widget} />
    case "amazing-header":
      return <AmazingHeaderWidget widget={widget} />
    case "blog-slider":
      return <BlogSliderWidget widget={widget} />
    case "product-gallery":
      return <ProductGalleryWidget productSlug={runtime.productSlug} />
    case "add-to-cart-box":
      return <AddToCartBoxWidget productSlug={runtime.productSlug} />
    case "most-viewed":
      return <MostViewedWidget widget={widget} />
    case "taste-box":
      return <TasteBoxWidget widget={widget} />
    case "package-block":
      return <PackageBlockWidget widget={widget} />
    case "blog-toc":
      return <BlogTocWidget widget={widget} />
    case "mega-menu":
      return <MegaMenuWidget widget={widget} />
    case "product-reviews":
      return <ProductReviewsWidget widget={widget} productSlug={runtime.productSlug} />
    case "account-dashboard":
      return <AccountDashboardWidget />
    case "breadcrumbs":
      return <BreadcrumbsWidget widget={widget} />
    case "store-header":
      return <StoreHeader widget={widget} siteName={runtime.siteName} logoUrl={runtime.logoUrl} />
    case "store-footer":
      return <StoreFooter widget={widget} siteName={runtime.siteName} />
    case "container":
      return null
    default:
      return <p className="text-sm text-muted-foreground">ویجت {widget.type}</p>
  }
}

function HeadingWidget({ widget, editor }: { widget: WidgetNode; editor?: EditorApi }) {
  const tag = propStr(widget.props, "tag", "h2")
  const text = propStr(widget.props, "text", "عنوان")
  const selected = editor?.selectedId === widget.id
  const scale = widget.style?.base?.fontSize || widget.style?.tablet?.fontSize || widget.style?.mobile?.fontSize
  const level = tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6" ? tag : "h2"
  const className = scale ? "font-bold text-foreground" : `wb-type-${level} font-bold`
  if (selected && editor) {
    return (
      <div
        className={className}
        contentEditable
        suppressContentEditableWarning
        onBlur={(event) => editor.onInline(widget.id, "text", event.currentTarget.textContent ?? "")}
      >
        {text}
      </div>
    )
  }
  const Tag = level
  return <Tag className={className}>{text}</Tag>
}

function TextWidget({ widget, editor }: { widget: WidgetNode; editor?: EditorApi }) {
  const text = propStr(widget.props, "text", "")
  const selected = editor?.selectedId === widget.id
  if (selected && editor) {
    return (
      <p
        className="whitespace-pre-wrap text-sm leading-7 text-foreground/80"
        contentEditable
        suppressContentEditableWarning
        onBlur={(event) => editor.onInline(widget.id, "text", event.currentTarget.textContent ?? "")}
      >
        {text}
      </p>
    )
  }
  return <p className="wb-type-body whitespace-pre-wrap text-foreground/80">{text}</p>
}

function ImageWidget({ widget }: { widget: WidgetNode }) {
  const globals = useBuilderGlobals()
  const [open, setOpen] = useState(false)
  const src = propStr(widget.props, "src")
  const alt = propStr(widget.props, "alt", "تصویر")
  const lightbox = globals.images.lightbox && globals.lightbox.enabled
  if (!src) {
    return (
      <div className="overflow-hidden" style={{ borderRadius: "var(--wb-img-radius)" }}>
        <div className="aspect-[4/3]">
          <AbstractArt tone="sky" label={alt} />
        </div>
      </div>
    )
  }
  const image = (
    <img
      src={src}
      alt={alt}
      loading={globals.images.lazy ? "lazy" : "eager"}
      className="wb-img"
    />
  )
  if (!lightbox) return image
  return (
    <>
      <button type="button" className="block w-full" onClick={() => setOpen(true)} aria-label={alt}>
        {image}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-6"
          style={{ background: "var(--wb-lightbox-bg)" }}
          onClick={() => setOpen(false)}
        >
          <img src={src} alt={alt} className="max-h-[85vh] max-w-full rounded-2xl" />
        </div>
      ) : null}
    </>
  )
}

function ButtonWidget({ widget }: { widget: WidgetNode }) {
  const tone = propStr(widget.props, "tone", "pink")
  const variant = tone === "navy" ? "secondary" : tone === "ghost" ? "ghost" : tone === "outline" ? "outline" : "primary"
  return (
    <Link href={propStr(widget.props, "href", "/shop")} className={`wb-btn wb-btn-${variant}`}>
      {propStr(widget.props, "label", "ادامه")}
    </Link>
  )
}

function IconWidget({ widget }: { widget: WidgetNode }) {
  const name = propStr(widget.props, "name", "spark")
  const icon =
    name === "truck" ? <Truck className="size-5" /> : name === "shield" ? <ShieldCheck className="size-5" /> : name === "heart" ? <Heart className="size-5" /> : name === "star" ? <Star className="size-5" /> : <Sparkles className="size-5" />
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
      <span className="grid size-10 place-items-center rounded-2xl bg-muted text-primary">{icon}</span>
      {propStr(widget.props, "label", "")}
    </div>
  )
}

function VideoWidget({ widget }: { widget: WidgetNode }) {
  const t = useTranslations("builder")
  const src = propStr(widget.props, "src")
  const embed = embedVideoSrc(src)
  if (!src) {
    return <div className="grid aspect-video place-items-center rounded-2xl bg-primary text-sm text-white">{t("video")}</div>
  }
  if (embed) {
    return <iframe title={t("video")} src={embed} className="aspect-video w-full rounded-2xl" allow="fullscreen" />
  }
  return <video src={src} controls className="aspect-video w-full rounded-2xl bg-black" />
}

function sanitizeHtml(html: string): string {
  const stripped = sanitizeBuilderHtml(html)
  if (typeof window === "undefined") return stripped
  return DOMPurify.sanitize(stripped, {
    ALLOWED_TAGS: ["p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "a", "h1", "h2", "h3", "h4", "blockquote", "span", "div", "img", "hr", "table", "thead", "tbody", "tr", "th", "td", "figure", "figcaption"],
    ALLOWED_ATTR: ["href", "title", "target", "rel", "src", "alt", "class"],
  })
}

function HtmlWidget({ widget }: { widget: WidgetNode }) {
  const clean = sanitizeHtml(propStr(widget.props, "html"))
  return <div className="prose prose-sm max-w-none text-foreground" dangerouslySetInnerHTML={{ __html: clean }} />
}

function MenuWidget({ widget }: { widget: WidgetNode }) {
  const links = parseLinks(widget.props.links, NAV)
  return (
    <nav className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Link key={link.href + link.label} href={link.href} className="wb-type-link rounded-full px-3 py-1.5 hover:bg-muted">
          {link.label}
        </Link>
      ))}
    </nav>
  )
}

function FormWidget({ widget }: { widget: WidgetNode }) {
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")
  if (done) return <p className="wb-type-body rounded-2xl bg-muted p-4 text-foreground">پیام شما ثبت شد. به‌زودی پاسخ می‌دهیم.</p>
  return (
    <form
      className="grid gap-3 rounded-3xl border border-border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        if (!String(data.get("name") ?? "").trim() || !String(data.get("phone") ?? "").trim() || !String(data.get("message") ?? "").trim()) {
          setError("همه فیلدها را کامل کنید.")
          return
        }
        setError("")
        setDone(true)
      }}
    >
      <h3 className="wb-type-h3">{propStr(widget.props, "title", "فرم")}</h3>
      <label className="grid gap-1">
        <span className="wb-label">نام</span>
        <input required name="name" className="wb-field" />
      </label>
      <label className="grid gap-1">
        <span className="wb-label">موبایل</span>
        <input required name="phone" className="wb-field" />
      </label>
      <label className="grid gap-1">
        <span className="wb-label">پیام</span>
        <textarea required name="message" className="wb-field min-h-24" />
      </label>
      {error ? <p className="wb-form-error">{error}</p> : null}
      <button type="submit" className="wb-btn wb-btn-primary">
        {propStr(widget.props, "submit", "ارسال")}
      </button>
    </form>
  )
}

const SLIDES = [
  {
    kicker: "مجموعه بهار ویبینو",
    title: "درخشش آرام، هر روز",
    text: "مراقبت پوست با بافت سبک و بسته‌بندی مینیمال",
    cta: "مشاهده مجموعه",
    href: "/shop",
    tone: "pink",
  },
  {
    kicker: "ارسال امروز",
    title: "زیبایی که می‌ماند",
    text: "منتخب ویبینو با ضمانت اصالت کالا",
    cta: "خرید تازه‌ها",
    href: "/shop?sort=new",
    tone: "navy",
  },
  {
    kicker: "مراقبت مو",
    title: "درخشش بدون سنگینی",
    text: "روغن و سرم‌های خانه کَلم",
    cta: "دسته مو",
    href: "/shop?category=hair",
    tone: "lilac",
  },
]

function HeroWidget() {
  const [index, setIndex] = useState(0)
  const slide = SLIDES[index] ?? SLIDES[0]
  return (
    <div className="sf-hero relative overflow-hidden rounded-[28px] px-6 py-10 md:px-12 md:py-16">
      <div className="pointer-events-none absolute -start-10 top-8 size-40 rounded-full bg-white/20" />
      <div className="pointer-events-none absolute end-10 bottom-0 h-48 w-36 rounded-t-full bg-white/15" />
      <p className="relative text-sm font-medium text-white/90">{slide.kicker}</p>
      <h2 className="relative mt-3 max-w-xl text-3xl font-bold leading-tight md:text-5xl">{slide.title}</h2>
      <p className="relative mt-3 max-w-md text-sm text-white/90 md:text-base">{slide.text}</p>
      <Link href={slide.href} className="relative mt-6 inline-flex rounded-full bg-card px-5 py-2.5 text-sm font-bold text-foreground">
        {slide.cta}
      </Link>
      <div className="relative mt-8 flex gap-2">
        {SLIDES.map((item, i) => (
          <button key={item.title} type="button" aria-label={item.title} onClick={() => setIndex(i)} className={`h-2 rounded-full ${i === index ? "w-8 bg-card" : "w-2 bg-white/50"}`} />
        ))}
      </div>
      <button type="button" aria-label="بعدی" className="absolute start-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white/25" onClick={() => setIndex((i) => (i + 1) % SLIDES.length)}>
        ‹
      </button>
      <button type="button" aria-label="قبلی" className="absolute end-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white/25" onClick={() => setIndex((i) => (i + SLIDES.length - 1) % SLIDES.length)}>
        ›
      </button>
    </div>
  )
}

function CategoryWidget({ widget }: { widget: WidgetNode }) {
  const catalog = useCatalog(8)
  const variant = propStr(widget.props, "variant", "popular")
  const title = propStr(widget.props, "title", "دسته‌ها")
  const items = catalog.categories.slice(0, 6)
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        <Link href="/shop" className="text-xs font-semibold text-primary">مشاهده همه</Link>
      </div>
      <div className={variant === "strip" ? "grid grid-cols-2 gap-3 md:grid-cols-6" : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"}>
        {items.map((item, index) => (
          <Link key={item.slug} href={`/shop?category=${item.slug}`} className={`flex flex-col items-center gap-3 rounded-3xl p-4 text-center ${index === 2 && variant !== "strip" ? "bg-primary text-white" : "bg-card text-foreground"} border border-border`}>
            <span className={`grid size-16 place-items-center rounded-2xl text-xs font-bold ${index === 2 && variant !== "strip" ? "bg-white/20" : "bg-muted"}`}>
              {item.name.slice(0, 1)}
            </span>
            <span className="text-sm font-semibold">{item.name}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function ProductCard({ product }: { product: ShopProduct }) {
  return <StoreProductCard product={product} />
}

function ProductGridWidget({ widget, editing }: { widget: WidgetNode; editing: boolean }) {
  const t = useTranslations("storefront")
  const limit = propNum(widget.props, "limit", 8)
  const source = propStr(widget.props, "source", "all")
  const showSort = propBool(widget.props, "showSort")
  const title = propStr(widget.props, "title", "")
  const runtime = useBuilderRuntime()
  const params = useSearchParams()
  const catalog = useCatalog(limit)
  const sort = params.get("sort") ?? "new"
  const category = params.get("category") || runtime.categorySlug || ""
  const brand = params.get("brand") ?? ""
  const products = useMemo(() => {
    let rows = [...catalog.products]
    if (source === "featured") rows = rows.slice().reverse()
    if (source === "related" && runtime.productSlug) rows = rows.filter((item) => item.slug !== runtime.productSlug)
    if (category) rows = rows.filter((item) => item.categorySlug === category || item.category === category)
    if (brand) rows = rows.filter((item) => item.brandSlug === brand || item.brand === brand)
    if (sort === "price") rows.sort((a, b) => a.price - b.price)
    if (sort === "price_desc") rows.sort((a, b) => b.price - a.price)
    return rows.slice(0, limit)
  }, [brand, catalog.products, category, limit, runtime.productSlug, sort, source])

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {title ? <h2 className="text-xl font-bold text-foreground">{title}</h2> : <span />}
        {showSort ? <SortTabs editing={editing} /> : null}
      </div>
      {products.length === 0 ? (
        <p className="sf-card p-8 text-center text-sm">{t("empty_none")}</p>
      ) : (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {products.map((product) => (
          runtime.loopDocument ? (
            <LoopCard key={product.slug} product={product} template={runtime.loopDocument} />
          ) : (
            <ProductCard key={product.slug} product={product} />
          )
        ))}
      </div>
      )}
    </section>
  )
}

function LoopCard({ product, template }: { product: ShopProduct; template: BuilderDocument }) {
  const money = useMoney()
  const runtime = useBuilderRuntime()
  const widgets = template.sections.flatMap((section) => section.columns.flatMap((column) => column.widgets))
  if (widgets.length === 1 && widgets[0]?.type === "product-card") {
    return <ProductCard product={product} />
  }
  const filled = fillDocumentTokens(widgets, {
    name: product.name,
    brand: product.brand,
    price: money(product.price),
    slug: product.slug,
    href: `/product/${product.slug}`,
  })
  return (
    <BuilderRuntimeProvider value={{ ...runtime, loopDocument: undefined, productSlug: product.slug }}>
      <article className="flex flex-col gap-2 rounded-3xl border border-border bg-card p-3">
        {filled.map((widget) => (
          <WidgetBody key={widget.id} widget={widget} />
        ))}
      </article>
    </BuilderRuntimeProvider>
  )
}

function SortTabs({ editing }: { editing: boolean }) {
  const t = useTranslations("storefront")
  const router = useRouter()
  const params = useSearchParams()
  const current = params.get("sort") ?? "new"
  const tabs = [
    { id: "new", label: t("sort_new") },
    { id: "featured", label: t("sort_featured") },
    { id: "price", label: t("sort_price") },
    { id: "price_desc", label: t("sort_price_desc") },
  ]
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`rounded-full px-3 py-1 text-xs font-semibold ${current === tab.id ? "bg-primary text-white" : "bg-card text-foreground"}`}
          onClick={() => {
            if (editing) return
            const next = new URLSearchParams(params.toString())
            next.set("sort", tab.id)
            router.replace(`?${next.toString()}`, { scroll: false })
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

function SingleCard({ widget }: { widget: WidgetNode }) {
  const slug = propStr(widget.props, "slug")
  const catalog = useCatalog(6)
  const product = catalog.products.find((item) => item.slug === slug) ?? catalog.products[0]
  if (!product) return null
  return <ProductCard product={product} />
}

function PromoWidget({ widget }: { widget: WidgetNode }) {
  const tone = propStr(widget.props, "tone", "pink")
  const bg = tone === "navy" ? "bg-primary text-white" : tone === "mist" ? "bg-card text-foreground" : "bg-primary text-white"
  return (
    <div className={`flex h-full flex-col justify-between rounded-[28px] p-6 ${bg}`}>
      <div>
        <h3 className="text-2xl font-bold">{propStr(widget.props, "title", "پیشنهاد")}</h3>
        <p className="mt-2 text-sm opacity-90">{propStr(widget.props, "text", "")}</p>
      </div>
      <Link href={propStr(widget.props, "href", "/shop")} className="mt-6 inline-flex w-fit rounded-full bg-card px-4 py-2 text-sm font-bold text-foreground">
        {propStr(widget.props, "cta", "بیشتر")}
      </Link>
    </div>
  )
}

function DealBar({ widget }: { widget: WidgetNode }) {
  const money = useMoney()
  const catalog = useCatalog(3)
  const deals = catalog.products.slice(0, 3)
  return (
    <div className="grid gap-3 rounded-[28px] bg-primary p-3 text-white md:grid-cols-4">
      <div className="rounded-2xl bg-white/15 px-4 py-3">
        <div className="text-xs opacity-80">پیشنهاد</div>
        <div className="font-bold">{propStr(widget.props, "title", "پیشنهاد امروز")}</div>
      </div>
      {deals.map((product) => (
        <Link key={product.slug} href={`/product/${product.slug}`} className="flex items-center justify-between rounded-2xl bg-white/15 px-4 py-3">
          <div>
            <div className="text-sm font-bold">{product.name}</div>
            <div className="text-xs">{money(product.price)}</div>
          </div>
          <span className="rounded-full bg-card px-2 py-1 text-[11px] font-bold text-primary">ویژه</span>
        </Link>
      ))}
    </div>
  )
}

function CountdownWidget({ widget }: { widget: WidgetNode }) {
  const locale = useLocale()
  const ends = propStr(widget.props, "ends")
  const target = useMemo(() => {
    const parsed = ends ? Date.parse(ends) : Number.NaN
    return Number.isNaN(parsed) ? Date.now() + 1000 * 60 * 60 * 18 : parsed
  }, [ends])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const diff = Math.max(0, target - now)
  const hours = Math.floor(diff / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)
  const parts = [
    { label: "ساعت", value: hours },
    { label: "دقیقه", value: minutes },
    { label: "ثانیه", value: seconds },
  ]
  return (
    <div className="rounded-[28px] bg-primary p-6 text-white">
      <h3 className="text-xl font-bold">{propStr(widget.props, "title", "زمان باقی‌مانده")}</h3>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {parts.map((part) => (
          <div key={part.label} className="rounded-2xl bg-white/10 px-2 py-3 text-center">
            <div className="text-2xl font-bold">{formatNumber(part.value, normalizeUiLocale(locale))}</div>
            <div className="text-[11px] opacity-80">{part.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TrustWidget() {
  const items = [
    { icon: <Truck className="size-5" />, title: "ارسال سریع", text: "بسته‌بندی امن به سراسر کشور" },
    { icon: <ShieldCheck className="size-5" />, title: "ضمانت اصالت", text: "کالای خانه‌های ویبینو" },
    { icon: <Sparkles className="size-5" />, title: "مشاوره پوست", text: "انتخاب شوینده مناسب" },
  ]
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {items.map((item) => (
        <div key={item.title} className="flex items-center gap-3 rounded-3xl bg-card p-4">
          <span className="grid size-11 place-items-center rounded-2xl bg-muted text-primary">{item.icon}</span>
          <div>
            <div className="font-bold text-foreground">{item.title}</div>
            <div className="text-xs text-foreground/70">{item.text}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function NewsletterWidget({ widget }: { widget: WidgetNode }) {
  const [done, setDone] = useState(false)
  return (
    <form
      className="flex flex-col gap-3 rounded-[28px] bg-card p-6 md:flex-row md:items-end"
      onSubmit={(event) => {
        event.preventDefault()
        setDone(true)
      }}
    >
      <div className="flex-1">
        <h3 className="text-xl font-bold text-foreground">{propStr(widget.props, "title", "خبرنامه")}</h3>
        <p className="mt-1 text-sm text-foreground/70">{done ? "ایمیل شما ثبت شد." : propStr(widget.props, "text", "")}</p>
      </div>
      <input required type="email" placeholder="ایمیل" className="h-11 rounded-full border border-border px-4 text-sm md:w-64" />
      <button type="submit" className="h-11 rounded-full bg-primary px-5 text-sm font-semibold text-white">عضویت</button>
    </form>
  )
}

function BrandRow({ widget }: { widget: WidgetNode }) {
  const catalog = useCatalog(6)
  const brands = catalog.brands.length ? catalog.brands : SAMPLE_BRANDS.map((name) => ({ name, slug: name }))
  return (
    <section>
      <h2 className="mb-4 text-xl font-bold text-foreground">{propStr(widget.props, "title", "برندها")}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {brands.slice(0, 6).map((brand) => (
          <Link key={brand.slug} href={`/shop?brand=${encodeURIComponent(brand.slug)}`} className="grid h-20 place-items-center rounded-2xl border border-border bg-card text-sm font-bold text-foreground">
            {brand.name}
          </Link>
        ))}
      </div>
    </section>
  )
}

const POSTS = [
  { title: "روتین صبحگاهی برای پوست شهری", text: "سه گام کوتاه که قبل از آفتاب جواب می‌دهد.", minutes: "۶" },
  { title: "شوینده را با نوع پوست جور کنید", text: "خشک، مختلط یا چرب؛ یک راهنمای ساده ویبینو.", minutes: "۸" },
  { title: "درخشش مو بدون روغن اضافه", text: "کی و چقدر از روغن مو استفاده کنیم.", minutes: "۵" },
]

function BlogWidget({ widget }: { widget: WidgetNode }) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">{propStr(widget.props, "title", "مجله")}</h2>
        <Link href="/blog" className="text-xs font-semibold text-primary">ادامه مجله</Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {POSTS.map((post) => (
          <article key={post.title} className="overflow-hidden rounded-[28px] bg-card">
            <div className="aspect-[16/9]">
              <AbstractArt tone="sky" label="مجله" />
            </div>
            <div className="p-4">
              <h3 className="font-bold text-foreground">{post.title}</h3>
              <p className="mt-2 text-sm leading-6 text-foreground/75">{post.text}</p>
              <p className="mt-3 text-xs text-primary">{post.minutes} دقیقه مطالعه</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function FilterWidget({ editing }: { editing: boolean }) {
  return <StoreFilters editing={editing} />
}

function ProductDetail({ slug, editing }: { slug?: string; editing: boolean }) {
  return <StorefrontProduct slug={slug} editing={editing} />
}

function CartWidget() {
  return <StorefrontCart />
}

function CheckoutWidget() {
  return <StorefrontCheckout />
}

function AccountWidget() {
  return <StorefrontAccount />
}

function StoreHeader({ widget, siteName, logoUrl }: { widget: WidgetNode; siteName?: string; logoUrl?: string | null }) {
  return <StorefrontHeader widget={widget} siteName={siteName} logoUrl={logoUrl} />
}

function StoreFooter({ widget, siteName }: { widget: WidgetNode; siteName?: string }) {
  return <StorefrontFooter widget={widget} siteName={siteName} />
}

export function widgetLabel(widget: WidgetNode): string {
  const text = propStr(widget.props, "text") || propStr(widget.props, "title") || propStr(widget.props, "label")
  return text || widget.type
}

export function Frame({ children }: { children: ReactNode }) {
  return <>{children}</>
}
