"use client"

import DOMPurify from "dompurify"
import {
  Heart,
  Mail,
  MapPin,
  Menu,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Truck,
  UserRound,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react"

import { addToCart, cartCount, cartSnapshot, clearCart, setQty, subscribeCart } from "../cart"
import { embedVideoSrc, sanitizeBuilderHtml } from "./sanitize-html"
import {
  SAMPLE_BRANDS,
  SAMPLE_CATEGORIES,
  SAMPLE_PRODUCTS,
  formatPrice,
  mapApiCategory,
  mapApiProduct,
  toneClass,
  type ShopCategory,
  type ShopProduct,
} from "../catalog"
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

function useCartCount() {
  return useSyncExternalStore(subscribeCart, cartCount, () => 0)
}

function useCartLines() {
  return useSyncExternalStore(subscribeCart, cartSnapshot, () => [])
}

function useMoney() {
  const t = useTranslations("builder")
  return (amount: number) => formatPrice(amount, t("currency_toman"))
}

function useCatalog(limit: number) {
  const [state, setState] = useState<{ products: ShopProduct[]; categories: ShopCategory[]; live: boolean }>({
    products: SAMPLE_PRODUCTS,
    categories: SAMPLE_CATEGORIES,
    live: false,
  })

  useEffect(() => {
    let cancel = false
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    fetch(`${base}/api/v1/public/catalog?per_page=${Math.max(limit, 12)}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: { items?: unknown[]; categories?: unknown[] } } | null) => {
        if (cancel || !json?.data) return
        const items = Array.isArray(json.data.items) ? json.data.items : []
        const categories = Array.isArray(json.data.categories) ? json.data.categories : []
        if (!items.length) return
        const products = items
          .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
          .map((item, index) => mapApiProduct(item, index))
        const mapped = categories
          .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
          .map((item, index) => mapApiCategory(item, index))
          .filter((item): item is ShopCategory => item !== null)
        setState({
          products,
          categories: mapped.length ? mapped : SAMPLE_CATEGORIES,
          live: true,
        })
      })
      .catch(() => undefined)
    return () => {
      cancel = true
    }
  }, [limit])

  return state
}

function Mark({ letter = "و" }: { letter?: string }) {
  return (
    <span className="grid size-11 place-items-center rounded-2xl bg-[#E16BA6] text-lg font-bold text-white shadow-sm">
      {letter.slice(0, 1)}
    </span>
  )
}

function AbstractArt({ tone, label }: { tone: string; label: string }) {
  return (
    <div className={`relative grid h-full w-full place-items-center bg-gradient-to-br ${toneClass(tone)}`}>
      <span className="absolute -start-6 top-6 size-24 rounded-full bg-white/40" />
      <span className="absolute end-4 bottom-4 size-16 rounded-full bg-[#0C2D63]/10" />
      <span className="relative text-sm font-bold text-[#0C2D63]/80">{label}</span>
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
      return <hr className="border-0 border-t" style={{ borderColor: propStr(widget.props, "color", "#e6eef6") }} />
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
    case "store-header":
      return <StoreHeader widget={widget} siteName={runtime.siteName} logoUrl={runtime.logoUrl} />
    case "store-footer":
      return <StoreFooter widget={widget} siteName={runtime.siteName} />
    case "container":
      return null
    default:
      return <p className="text-sm text-[#0C2D63]/60">ویجت {widget.type}</p>
  }
}

function HeadingWidget({ widget, editor }: { widget: WidgetNode; editor?: EditorApi }) {
  const tag = propStr(widget.props, "tag", "h2")
  const text = propStr(widget.props, "text", "عنوان")
  const selected = editor?.selectedId === widget.id
  const scale = widget.style?.base?.fontSize || widget.style?.tablet?.fontSize || widget.style?.mobile?.fontSize
  const level = tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6" ? tag : "h2"
  const className = scale ? "font-bold text-[#0C2D63]" : `wb-type-${level} font-bold`
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
        className="whitespace-pre-wrap text-sm leading-7 text-[#0C2D63]/80"
        contentEditable
        suppressContentEditableWarning
        onBlur={(event) => editor.onInline(widget.id, "text", event.currentTarget.textContent ?? "")}
      >
        {text}
      </p>
    )
  }
  return <p className="wb-type-body whitespace-pre-wrap text-[#0C2D63]/80">{text}</p>
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
    <div className="flex items-center gap-2 text-sm font-semibold text-[#0C2D63]">
      <span className="grid size-10 place-items-center rounded-2xl bg-[#F5F8FB] text-[#E16BA6]">{icon}</span>
      {propStr(widget.props, "label", "")}
    </div>
  )
}

function VideoWidget({ widget }: { widget: WidgetNode }) {
  const t = useTranslations("builder")
  const src = propStr(widget.props, "src")
  const embed = embedVideoSrc(src)
  if (!src) {
    return <div className="grid aspect-video place-items-center rounded-2xl bg-[#0C2D63] text-sm text-white">{t("video")}</div>
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
  return <div className="prose prose-sm max-w-none text-[#0C2D63]" dangerouslySetInnerHTML={{ __html: clean }} />
}

function MenuWidget({ widget }: { widget: WidgetNode }) {
  const links = parseLinks(widget.props.links, NAV)
  return (
    <nav className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Link key={link.href + link.label} href={link.href} className="wb-type-link rounded-full px-3 py-1.5 hover:bg-[#F5F8FB]">
          {link.label}
        </Link>
      ))}
    </nav>
  )
}

function FormWidget({ widget }: { widget: WidgetNode }) {
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")
  if (done) return <p className="wb-type-body rounded-2xl bg-[#F5F8FB] p-4 text-[#0C2D63]">پیام شما ثبت شد. به‌زودی پاسخ می‌دهیم.</p>
  return (
    <form
      className="grid gap-3 rounded-3xl border border-[#e6eef6] bg-white p-4"
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
  const pink = slide.tone !== "navy"
  return (
    <div className="relative overflow-hidden rounded-[28px] px-6 py-10 text-white md:px-12 md:py-16" style={{ background: pink ? "linear-gradient(120deg,#E16BA6,#f3a4cb)" : "linear-gradient(120deg,#0C2D63,#3d6ea8)" }}>
      <div className="pointer-events-none absolute -start-10 top-8 size-40 rounded-full bg-white/20" />
      <div className="pointer-events-none absolute end-10 bottom-0 h-48 w-36 rounded-t-full bg-white/15" />
      <p className="relative text-sm font-medium text-white/90">{slide.kicker}</p>
      <h2 className="relative mt-3 max-w-xl text-3xl font-bold leading-tight md:text-5xl">{slide.title}</h2>
      <p className="relative mt-3 max-w-md text-sm text-white/90 md:text-base">{slide.text}</p>
      <Link href={slide.href} className="relative mt-6 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#0C2D63]">
        {slide.cta}
      </Link>
      <div className="relative mt-8 flex gap-2">
        {SLIDES.map((item, i) => (
          <button key={item.title} type="button" aria-label={item.title} onClick={() => setIndex(i)} className={`h-2 rounded-full ${i === index ? "w-8 bg-white" : "w-2 bg-white/50"}`} />
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
        <h2 className="text-xl font-bold text-[#0C2D63]">{title}</h2>
        <Link href="/shop" className="text-xs font-semibold text-[#E16BA6]">مشاهده همه</Link>
      </div>
      <div className={variant === "strip" ? "grid grid-cols-2 gap-3 md:grid-cols-6" : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"}>
        {items.map((item, index) => (
          <Link key={item.slug} href={`/shop?category=${item.slug}`} className={`flex flex-col items-center gap-3 rounded-3xl p-4 text-center ${index === 2 && variant !== "strip" ? "bg-[#E16BA6] text-white" : "bg-white text-[#0C2D63]"} border border-[#e6eef6]`}>
            <span className={`grid size-16 place-items-center rounded-2xl text-xs font-bold ${index === 2 && variant !== "strip" ? "bg-white/20" : "bg-[#F5F8FB]"}`}>
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
  const money = useMoney()
  const t = useTranslations("cart")
  const [liked, setLiked] = useState(false)
  const off = product.compare && product.compare > product.price ? Math.round((1 - product.price / product.compare) * 100) : 0
  return (
    <article className="flex flex-col rounded-3xl border border-[#e6eef6] bg-white p-3 shadow-sm">
      <div className="relative aspect-square overflow-hidden rounded-2xl">
        {product.image ? (
          <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <AbstractArt tone={product.tone} label={product.brand} />
        )}
        <button type="button" aria-label="علاقه‌مندی" onClick={() => setLiked((v) => !v)} className="absolute end-2 top-2 grid size-8 place-items-center rounded-full bg-white text-[#0C2D63]">
          <Heart className={`size-4 ${liked ? "fill-[#E16BA6] text-[#E16BA6]" : ""}`} />
        </button>
        {off > 0 ? <span className="absolute start-2 top-2 rounded-full bg-[#E16BA6] px-2 py-0.5 text-[11px] font-bold text-white">{off}٪</span> : null}
      </div>
      <h3 className="mt-3 line-clamp-2 min-h-10 text-sm font-bold text-[#0C2D63]">
        <Link href={`/product/${product.slug}`}>{product.name}</Link>
      </h3>
      <p className="mt-1 text-xs text-[#7c5cbf]">{product.brand}</p>
      <div className="mt-auto flex items-end justify-between gap-2 pt-3">
        <div>
          {product.compare ? <div className="text-[11px] text-[#0C2D63]/40 line-through">{money(product.compare)}</div> : null}
          <div className="text-sm font-bold text-[#0C2D63]">{money(product.price)}</div>
        </div>
        <button
          type="button"
          className="rounded-full bg-[#E16BA6] px-3 py-1.5 text-xs font-semibold text-white"
          onClick={() => addToCart(product)}
        >
          {t("add_to_cart")}
        </button>
      </div>
    </article>
  )
}

function ProductGridWidget({ widget, editing }: { widget: WidgetNode; editing: boolean }) {
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
    if (brand) rows = rows.filter((item) => item.brand === brand)
    if (sort === "price") rows.sort((a, b) => a.price - b.price)
    if (sort === "price_desc") rows.sort((a, b) => b.price - a.price)
    return rows.slice(0, limit)
  }, [brand, catalog.products, category, limit, runtime.productSlug, sort, source])

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {title ? <h2 className="text-xl font-bold text-[#0C2D63]">{title}</h2> : <span />}
        {showSort ? <SortTabs editing={editing} /> : null}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => (
          runtime.loopDocument ? (
            <LoopCard key={product.slug} product={product} template={runtime.loopDocument} />
          ) : (
            <ProductCard key={product.slug} product={product} />
          )
        ))}
      </div>
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
      <article className="flex flex-col gap-2 rounded-3xl border border-[#e6eef6] bg-white p-3">
        {filled.map((widget) => (
          <WidgetBody key={widget.id} widget={widget} />
        ))}
      </article>
    </BuilderRuntimeProvider>
  )
}

function SortTabs({ editing }: { editing: boolean }) {
  const router = useRouter()
  const params = useSearchParams()
  const current = params.get("sort") ?? "new"
  const tabs = [
    { id: "new", label: "تازه‌ترین" },
    { id: "featured", label: "پرفروش" },
    { id: "price", label: "ارزان‌ترین" },
    { id: "price_desc", label: "گران‌ترین" },
  ]
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`rounded-full px-3 py-1 text-xs font-semibold ${current === tab.id ? "bg-[#0C2D63] text-white" : "bg-white text-[#0C2D63]"}`}
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
  const bg = tone === "navy" ? "bg-[#0C2D63] text-white" : tone === "mist" ? "bg-white text-[#0C2D63]" : "bg-[#E16BA6] text-white"
  return (
    <div className={`flex h-full flex-col justify-between rounded-[28px] p-6 ${bg}`}>
      <div>
        <h3 className="text-2xl font-bold">{propStr(widget.props, "title", "پیشنهاد")}</h3>
        <p className="mt-2 text-sm opacity-90">{propStr(widget.props, "text", "")}</p>
      </div>
      <Link href={propStr(widget.props, "href", "/shop")} className="mt-6 inline-flex w-fit rounded-full bg-white px-4 py-2 text-sm font-bold text-[#0C2D63]">
        {propStr(widget.props, "cta", "بیشتر")}
      </Link>
    </div>
  )
}

function DealBar({ widget }: { widget: WidgetNode }) {
  const money = useMoney()
  return (
    <div className="grid gap-3 rounded-[28px] bg-[#E16BA6] p-3 text-white md:grid-cols-4">
      <div className="rounded-2xl bg-white/15 px-4 py-3">
        <div className="text-xs opacity-80">پیشنهاد</div>
        <div className="font-bold">{propStr(widget.props, "title", "پیشنهاد امروز")}</div>
      </div>
      {["سرم لومِن", "بالم نورا", "مه پاش"].map((name, index) => (
        <div key={name} className="flex items-center justify-between rounded-2xl bg-white/15 px-4 py-3">
          <div>
            <div className="text-sm font-bold">{name}</div>
            <div className="text-xs">{money([1860000, 640000, 540000][index] ?? 0)}</div>
          </div>
          <span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-[#E16BA6]">ویژه</span>
        </div>
      ))}
    </div>
  )
}

function CountdownWidget({ widget }: { widget: WidgetNode }) {
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
    <div className="rounded-[28px] bg-[#0C2D63] p-6 text-white">
      <h3 className="text-xl font-bold">{propStr(widget.props, "title", "زمان باقی‌مانده")}</h3>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {parts.map((part) => (
          <div key={part.label} className="rounded-2xl bg-white/10 px-2 py-3 text-center">
            <div className="text-2xl font-bold">{new Intl.NumberFormat("fa-IR").format(part.value)}</div>
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
        <div key={item.title} className="flex items-center gap-3 rounded-3xl bg-white p-4">
          <span className="grid size-11 place-items-center rounded-2xl bg-[#F5F8FB] text-[#E16BA6]">{item.icon}</span>
          <div>
            <div className="font-bold text-[#0C2D63]">{item.title}</div>
            <div className="text-xs text-[#0C2D63]/70">{item.text}</div>
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
      className="flex flex-col gap-3 rounded-[28px] bg-white p-6 md:flex-row md:items-end"
      onSubmit={(event) => {
        event.preventDefault()
        setDone(true)
      }}
    >
      <div className="flex-1">
        <h3 className="text-xl font-bold text-[#0C2D63]">{propStr(widget.props, "title", "خبرنامه")}</h3>
        <p className="mt-1 text-sm text-[#0C2D63]/70">{done ? "ایمیل شما ثبت شد." : propStr(widget.props, "text", "")}</p>
      </div>
      <input required type="email" placeholder="ایمیل" className="h-11 rounded-full border border-[#e6eef6] px-4 text-sm md:w-64" />
      <button type="submit" className="h-11 rounded-full bg-[#0C2D63] px-5 text-sm font-semibold text-white">عضویت</button>
    </form>
  )
}

function BrandRow({ widget }: { widget: WidgetNode }) {
  return (
    <section>
      <h2 className="mb-4 text-xl font-bold text-[#0C2D63]">{propStr(widget.props, "title", "برندها")}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {SAMPLE_BRANDS.map((brand) => (
          <div key={brand} className="grid h-20 place-items-center rounded-2xl border border-[#e6eef6] bg-white text-sm font-bold text-[#0C2D63]">
            {brand}
          </div>
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
        <h2 className="text-xl font-bold text-[#0C2D63]">{propStr(widget.props, "title", "مجله")}</h2>
        <Link href="/blog" className="text-xs font-semibold text-[#E16BA6]">ادامه مجله</Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {POSTS.map((post) => (
          <article key={post.title} className="overflow-hidden rounded-[28px] bg-white">
            <div className="aspect-[16/9]">
              <AbstractArt tone="sky" label="مجله" />
            </div>
            <div className="p-4">
              <h3 className="font-bold text-[#0C2D63]">{post.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#0C2D63]/75">{post.text}</p>
              <p className="mt-3 text-xs text-[#7c5cbf]">{post.minutes} دقیقه مطالعه</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function FilterWidget({ editing }: { editing: boolean }) {
  const router = useRouter()
  const params = useSearchParams()
  const catalog = useCatalog(12)
  const category = params.get("category") ?? ""
  const brand = params.get("brand") ?? ""
  function setParam(key: string, value: string) {
    if (editing) return
    const next = new URLSearchParams(params.toString())
    if (!value || next.get(key) === value) next.delete(key)
    else next.set(key, value)
    router.replace(`?${next.toString()}`, { scroll: false })
  }
  return (
    <aside className="rounded-3xl border border-[#e6eef6] bg-white p-4">
      <div className="mb-3 text-sm font-bold text-[#0C2D63]">فیلترها</div>
      <details open className="border-b border-[#e6eef6] py-2">
        <summary className="cursor-pointer text-sm font-semibold text-[#0C2D63]">دسته‌بندی</summary>
        <div className="mt-2 grid gap-1">
          {catalog.categories.map((item) => (
            <button key={item.slug} type="button" onClick={() => setParam("category", item.slug)} className={`rounded-xl px-2 py-1 text-start text-sm ${category === item.slug ? "bg-[#F5F8FB] font-bold text-[#E16BA6]" : "text-[#0C2D63]"}`}>
              {item.name}
            </button>
          ))}
        </div>
      </details>
      <details open className="py-2">
        <summary className="cursor-pointer text-sm font-semibold text-[#0C2D63]">خانه برند</summary>
        <div className="mt-2 grid gap-1">
          {SAMPLE_BRANDS.map((item) => (
            <label key={item} className="flex items-center justify-between gap-2 text-sm text-[#0C2D63]">
              <span>{item}</span>
              <input type="checkbox" checked={brand === item} onChange={() => setParam("brand", item)} />
            </label>
          ))}
        </div>
      </details>
    </aside>
  )
}

function ProductDetail({ slug, editing }: { slug?: string; editing: boolean }) {
  const money = useMoney()
  const t = useTranslations("cart")
  const catalog = useCatalog(8)
  const product = catalog.products.find((item) => item.slug === slug) ?? catalog.products[0]
  const [qty, setQuantity] = useState(1)
  const [tone, setTone] = useState(product?.tone ?? "pink")
  const [tab, setTab] = useState("desc")
  if (!product) return null
  const swatches = [
    { id: "rose", label: "گل‌بهی" },
    { id: "pink", label: "صورتی" },
    { id: "navy", label: "سرمه" },
  ]
  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <div className="aspect-square overflow-hidden rounded-[28px] border border-[#e6eef6] bg-white">
          {product.image ? <img src={product.image} alt={product.name} className="h-full w-full object-cover" /> : <AbstractArt tone={tone} label={product.brand} />}
        </div>
        <div className="mt-3 flex gap-2">
          {swatches.map((swatch) => (
            <button key={swatch.id} type="button" aria-label={swatch.label} onClick={() => setTone(swatch.id)} className={`h-16 w-16 overflow-hidden rounded-2xl border ${tone === swatch.id ? "border-[#E16BA6]" : "border-[#e6eef6]"}`}>
              <AbstractArt tone={swatch.id} label="" />
            </button>
          ))}
        </div>
      </div>
      <div className="lg:col-span-7">
        <p className="text-xs font-semibold text-[#7c5cbf]">{product.brand}</p>
        <h1 className="mt-1 text-2xl font-bold text-[#0C2D63] md:text-3xl">{product.name}</h1>
        <p className="mt-3 text-sm leading-7 text-[#0C2D63]/80">{product.description}</p>
        <div className="mt-4 text-2xl font-bold text-[#0C2D63]">{money(product.price)}</div>
        <div className="mt-4 flex flex-wrap gap-2">
          {swatches.map((swatch) => (
            <button key={swatch.id} type="button" onClick={() => setTone(swatch.id)} className={`rounded-full px-3 py-1 text-xs font-semibold ${tone === swatch.id ? "bg-[#E16BA6] text-white" : "bg-[#F5F8FB] text-[#0C2D63]"}`}>
              {swatch.label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center rounded-full border border-[#e6eef6]">
            <button type="button" className="px-3 py-2" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="کم">−</button>
            <span className="w-8 text-center text-sm font-bold">{new Intl.NumberFormat("fa-IR").format(qty)}</span>
            <button type="button" className="px-3 py-2" onClick={() => setQuantity((q) => q + 1)} aria-label="زیاد">+</button>
          </div>
          <button type="button" disabled={editing} className="rounded-full bg-[#E16BA6] px-6 py-2.5 text-sm font-bold text-white disabled:opacity-60" onClick={() => addToCart(product, qty)}>
            {t("add_to_cart")}
          </button>
        </div>
        <div className="mt-5 rounded-3xl border border-[#e6eef6] bg-[#F5F8FB] p-4">
          <div className="text-sm font-bold text-[#0C2D63]">خرید اقساطی ویبینو</div>
          <p className="mt-1 text-xs leading-6 text-[#0C2D63]/75">تا سه قسط، بدون بهره نمایشی. این جعبه نمونه است و هنوز به درگاه وصل نیست.</p>
          <div className="mt-2 text-sm font-bold text-[#0C2D63]">{money(Math.round(product.price / 3))} هر قسط</div>
        </div>
        <div className="mt-6 flex gap-2 border-b border-[#e6eef6]">
          {[
            { id: "desc", label: "توضیحات" },
            { id: "spec", label: "مشخصات" },
            { id: "faq", label: "پرسش‌ها" },
          ].map((item) => (
            <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`px-3 py-2 text-sm font-semibold ${tab === item.id ? "border-b-2 border-[#E16BA6] text-[#0C2D63]" : "text-[#0C2D63]/50"}`}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="py-4 text-sm leading-7 text-[#0C2D63]/80">
          {tab === "spec" ? "بافت سبک، مناسب استفاده روزانه، بسته‌بندی قابل بازیافت ویبینو." : tab === "faq" ? "برای پوست حساس ابتدا روی ساعد امتحان کنید." : product.description}
        </div>
      </div>
    </div>
  )
}

function CartWidget() {
  const money = useMoney()
  const lines = useCartLines()
  const total = lines.reduce((sum, line) => sum + line.price * line.qty, 0)
  if (!lines.length) {
    return (
      <div className="rounded-[28px] bg-white p-8 text-center">
        <h2 className="text-xl font-bold text-[#0C2D63]">سبد ویبینو خالی است</h2>
        <Link href="/shop" className="mt-4 inline-flex rounded-full bg-[#E16BA6] px-5 py-2 text-sm font-bold text-white">رفتن به فروشگاه</Link>
      </div>
    )
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="grid gap-3">
        {lines.map((line) => (
          <div key={line.slug} className="flex items-center gap-3 rounded-3xl bg-white p-3">
            <div className="size-20 overflow-hidden rounded-2xl">{line.image ? <img src={line.image} alt="" className="h-full w-full object-cover" /> : <AbstractArt tone={line.tone} label="" />}</div>
            <div className="flex-1">
              <div className="font-bold text-[#0C2D63]">{line.name}</div>
              <div className="text-sm">{money(line.price)}</div>
            </div>
            <input className="h-10 w-16 rounded-xl border border-[#e6eef6] text-center" type="number" min={0} value={line.qty} onChange={(event) => setQty(line.slug, Number(event.target.value))} />
          </div>
        ))}
      </div>
      <aside className="h-fit rounded-3xl bg-[#0C2D63] p-5 text-white">
        <div className="text-sm opacity-80">جمع</div>
        <div className="mt-1 text-2xl font-bold">{money(total)}</div>
        <Link href="/checkout" className="mt-4 block rounded-full bg-[#E16BA6] py-2.5 text-center text-sm font-bold">تسویه</Link>
        <button type="button" className="mt-2 w-full text-xs opacity-80" onClick={() => clearCart()}>خالی کردن سبد</button>
      </aside>
    </div>
  )
}

function CheckoutWidget() {
  const [done, setDone] = useState(false)
  if (done) {
    return <div className="rounded-[28px] bg-white p-8 text-[#0C2D63]">سفارش نمونه ثبت شد. اتصال پرداخت در مرحله بعد فعال می‌شود.</div>
  }
  return (
    <form
      className="grid gap-3 rounded-[28px] bg-white p-6 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault()
        setDone(true)
      }}
    >
      <h2 className="text-xl font-bold text-[#0C2D63] md:col-span-2">تسویه ویبینو</h2>
      <input required placeholder="نام" className="h-11 rounded-xl border border-[#e6eef6] px-3 text-sm" />
      <input required placeholder="موبایل" className="h-11 rounded-xl border border-[#e6eef6] px-3 text-sm" />
      <input required placeholder="شهر" className="h-11 rounded-xl border border-[#e6eef6] px-3 text-sm" />
      <input required placeholder="نشانی" className="h-11 rounded-xl border border-[#e6eef6] px-3 text-sm" />
      <button type="submit" className="h-11 rounded-full bg-[#E16BA6] text-sm font-bold text-white md:col-span-2">ثبت سفارش نمونه</button>
    </form>
  )
}

function AccountWidget() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {[
        { href: "/login", title: "ورود", text: "با حساب ویبینو وارد شوید." },
        { href: "/account/change-password", title: "رمز عبور", text: "تغییر رمز از پنل کاربری." },
        { href: "/shop", title: "سفارش‌ها", text: "تاریخچه خرید به‌زودی اینجا می‌آید." },
      ].map((card) => (
        <Link key={card.href} href={card.href} className="rounded-[28px] bg-white p-5">
          <div className="font-bold text-[#0C2D63]">{card.title}</div>
          <p className="mt-2 text-sm text-[#0C2D63]/70">{card.text}</p>
        </Link>
      ))}
    </div>
  )
}

function StoreHeader({ widget, siteName, logoUrl }: { widget: WidgetNode; siteName?: string; logoUrl?: string | null }) {
  const count = useCartCount()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const router = useRouter()
  const links = parseLinks(widget.props.links, NAV)
  const name = siteName || propStr(widget.props, "mark", "ویبینو")
  return (
    <header className="sticky top-0 z-40 border-b border-[#e6eef6] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/cart" className="inline-flex items-center gap-2 rounded-full bg-[#E16BA6] px-4 py-2 text-sm font-bold text-white">
          سبد
          <span className="grid size-5 place-items-center rounded-full bg-white text-[11px] text-[#E16BA6]">{new Intl.NumberFormat("fa-IR").format(count)}</span>
        </Link>
        <Link href="/account" className="hidden items-center gap-2 rounded-full bg-[#F5F8FB] px-4 py-2 text-sm font-semibold text-[#0C2D63] sm:inline-flex">
          <UserRound className="size-4" />
          ورود و عضویت
        </Link>
        <form
          className="flex h-11 flex-1 items-center gap-2 rounded-full bg-[#F5F8FB] px-4"
          onSubmit={(event) => {
            event.preventDefault()
            router.push(query.trim() ? `/shop?q=${encodeURIComponent(query.trim())}` : "/shop")
          }}
        >
          <Search className="size-4 text-[#0C2D63]/50" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جستجوی ویبینو" className="w-full bg-transparent text-sm outline-none" />
        </form>
        <Link href="/" className="flex items-center gap-2">
          {logoUrl ? <img src={logoUrl} alt={name} className="h-11 w-auto" /> : <Mark letter={name.slice(0, 1)} />}
          <span className="hidden text-lg font-bold text-[#0C2D63] sm:inline">{name}</span>
        </Link>
      </div>
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 pb-3">
        <button type="button" className="inline-flex items-center gap-2 rounded-full px-2 py-1 text-sm font-bold text-[#0C2D63]" onClick={() => setOpen((v) => !v)}>
          <Menu className="size-4" />
          دسته‌بندی
        </button>
        <nav className="flex flex-1 flex-wrap items-center justify-end gap-1">
          {links.map((link) => (
            <Link key={link.href + link.label} href={link.href} className="rounded-full px-3 py-1.5 text-sm text-[#0C2D63] hover:bg-[#F5F8FB]">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      {open ? (
        <div className="border-t border-[#e6eef6] bg-white">
          <div className="mx-auto grid max-w-6xl gap-2 px-4 py-3 sm:grid-cols-3">
            {SAMPLE_CATEGORIES.map((item) => (
              <Link key={item.slug} href={`/shop?category=${item.slug}`} className="rounded-2xl bg-[#F5F8FB] px-3 py-2 text-sm font-semibold text-[#0C2D63]" onClick={() => setOpen(false)}>
                {item.name}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </header>
  )
}

function StoreFooter({ widget, siteName }: { widget: WidgetNode; siteName?: string }) {
  const about = propStr(widget.props, "about", "گالری ویبینو از سال تازه، مراقبت پوست و آرایش را با انتخاب کوتاه و شفاف می‌فروشد. طراحی و فروشگاه روی وبینو ساخته شده است.")
  return (
    <footer className="mt-8 border-t border-[#e6eef6] bg-white text-[#0C2D63]">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-2">
        <div>
          <h3 className="font-bold">مرکز تماس {siteName || "ویبینو"}</h3>
          <p className="mt-2 text-sm leading-7 text-[#0C2D63]/70">پاسخگویی هر روز، غیر از تعطیل رسمی.</p>
        </div>
        <div className="grid gap-2 text-sm">
          <div className="flex items-center gap-2"><Phone className="size-4 text-[#E16BA6]" />{propStr(widget.props, "phone", "۰۲۱۹۱۰۹۱۰۹۱")}</div>
          <div className="flex items-center gap-2"><Mail className="size-4 text-[#E16BA6]" />{propStr(widget.props, "email", "hello@webino.shop")}</div>
          <div className="flex items-center gap-2"><MapPin className="size-4 text-[#E16BA6]" />تهران، دفتر ویبینو</div>
        </div>
      </div>
      <p className="mx-auto max-w-3xl px-4 pb-8 text-center text-sm leading-8">{about}</p>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pb-8 text-xs">
        <span>© {new Intl.DateTimeFormat("fa-IR", { year: "numeric" }).format(new Date())} {siteName || "ویبینو"}</span>
        <span className="rounded-xl bg-[#0C2D63] px-3 py-2 font-semibold text-white">پرداخت امن</span>
        <span className="rounded-xl bg-[#1f9d6a] px-3 py-2 font-semibold text-white">ارسال سریع</span>
        <span className="rounded-xl bg-[#7c5cbf] px-3 py-2 font-semibold text-white">ضمانت اصالت</span>
      </div>
    </footer>
  )
}

export function widgetLabel(widget: WidgetNode): string {
  const text = propStr(widget.props, "text") || propStr(widget.props, "title") || propStr(widget.props, "label")
  return text || widget.type
}

export function Frame({ children }: { children: ReactNode }) {
  return <>{children}</>
}
