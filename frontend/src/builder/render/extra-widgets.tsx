"use client"

/* Additional page-builder widgets (product query carousel, banner grid, tabs, FAQ accordion,
 * icon box/list, testimonials, brand slider, gallery/carousel, announcement, map, counters,
 * social/share, pricing, blog query, search box, category list, login/tracking/wishlist).
 * Every widget renders only real data or content entered by the admin — no invented numbers. */

import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Gift,
  Headphones,
  Heart,
  Link2,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Truck,
  X,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react"

import { useCatalog, useProductQuery } from "../storefront/use-catalog"
import { StoreProductCard } from "../storefront/ui"
import { linkAttrs, propBool, propNum, propStr } from "../props"
import type { WidgetNode } from "../types"
import { useIsClassicSkin } from "./runtime"
import { ClassicProductRow } from "@/themes/ecommerce-classic/components/ClassicHome"
import { imageSrcSet, imageUrl, originalUrl } from "@/lib/image-url"
import { Img } from "./img"

/* ------------------------------------------------------------------ utils */

/** "a|b|c" per line → string[][]; a literal "\n" inside a cell becomes a newline. */
export function splitRows(text: string): string[][] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("|").map((cell) => cell.trim().replace(/\\n/g, "\n")))
}

const ICONS: Record<string, LucideIcon> = {
  truck: Truck,
  shield: ShieldCheck,
  star: Star,
  sparkles: Sparkles,
  heart: Heart,
  gift: Gift,
  phone: Phone,
  clock: Clock,
  card: CreditCard,
  badge: BadgeCheck,
  support: Headphones,
  map: MapPin,
}


export function WIcon({ name, size = 22 }: { name: string; size?: number }) {
  const Icon = ICONS[name] ?? BadgeCheck
  return <Icon size={size} aria-hidden="true" />
}

function SectionTitle({ title, href, more }: { title: string; href?: string; more?: string }) {
  if (!title) return null
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-lg font-extrabold text-foreground md:text-xl">{title}</h2>
      {href ? (
        <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
          {more || "مشاهده همه"} <ChevronLeft size={14} />
        </Link>
      ) : null}
    </div>
  )
}

function safeHref(href: string, fallback = "#"): string {
  const v = href.trim()
  if (!v) return fallback
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(v)) return v
  return fallback
}

/* ------------------------------------------------------- product carousel */

export function ProductQueryWidget({ widget }: { widget: WidgetNode }) {
  const classic = useIsClassicSkin()
  const title = propStr(widget.props, "title", "")
  const limit = Math.max(1, Math.min(24, propNum(widget.props, "limit", 10)))
  const layout = propStr(widget.props, "layout", "slider")
  const href = propStr(widget.props, "href", "")
  const sort = propStr(widget.props, "sort", "newest")
  const brand = propStr(widget.props, "brand", "")
  const onSale = propBool(widget.props, "onSale")
  const inStock = propBool(widget.props, "inStock")
  const excludeSlug = propStr(widget.props, "excludeSlug", "")
  // Optional category tabs: "label|category-slug" per line (3.8).
  const tabs = splitRows(propStr(widget.props, "tabs", "")).filter(([label]) => label)
  const [tabIndex, setTabIndex] = useState(0)
  const activeTab = tabs.length ? tabs[Math.min(tabIndex, tabs.length - 1)] : null
  const category = activeTab ? activeTab[1] ?? "" : propStr(widget.props, "category", "")
  const query = useProductQuery({ sort, limit: excludeSlug ? limit + 1 : limit, category, brand, onSale, inStock })
  const loading = query.loading
  const products = excludeSlug ? query.products.filter((p) => p.slug !== excludeSlug).slice(0, limit) : query.products
  const moreHref = href || `/shop?${new URLSearchParams({ ...(sort ? { sort } : {}), ...(category ? { category } : {}), ...(brand ? { brand } : {}) }).toString()}`
  const tabBar = tabs.length ? (
    <div role="tablist" className="mb-3 flex gap-2 overflow-x-auto">
      {tabs.map(([label], i) => (
        <button
          key={label + i}
          type="button"
          role="tab"
          aria-selected={i === tabIndex}
          onClick={() => setTabIndex(i)}
          className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-bold ${i === tabIndex ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground/75"}`}
        >
          {label}
        </button>
      ))}
    </div>
  ) : null
  if (!loading && !products.length && !tabs.length) return null
  if (classic && layout === "slider")
    return (
      <div>
        {tabBar}
        <ClassicProductRow title={title || "محصولات"} products={products} href={moreHref} />
      </div>
    )
  return (
    <section className="wbx-products">
      <SectionTitle title={title} href={moreHref} />
      {tabBar}
      <div className={layout === "slider" ? "flex snap-x gap-3 overflow-x-auto pb-2 [&>*]:w-48 [&>*]:shrink-0 [&>*]:snap-start" : "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"}>
        {products.map((product) => (
          <StoreProductCard key={product.slug} product={product} />
        ))}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------ banner grid */

export function BannerGridWidget({ widget }: { widget: WidgetNode }) {
  const rows = splitRows(propStr(widget.props, "items", ""))
  const cols = Math.max(1, Math.min(4, propNum(widget.props, "columns", 2)))
  const ratio = propStr(widget.props, "ratio", "16/7")
  const radius = Math.max(0, Math.min(40, propNum(widget.props, "radius", 16)))
  if (!rows.length) return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">بنرها را در تنظیمات ویجت وارد کنید (تصویر|پیوند|عنوان).</p>
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {rows.map(([image, href, alt, mobileImage], i) => {
        const sizes = "(max-width: 767px) 100vw, (max-width: 1100px) 50vw, 900px"
        const desk = image
          ? {
              src: i === 0 ? originalUrl(image) : imageUrl(image, 1200, false),
              srcSet: imageSrcSet(image, false),
              sizes,
            }
          : null
        const mob = mobileImage
          ? {
              src: i === 0 ? originalUrl(mobileImage) : imageUrl(mobileImage, 800, false),
              srcSet: imageSrcSet(mobileImage, false),
              sizes: "100vw",
            }
          : null
        return (
        <Link key={i} href={safeHref(href || "", "/shop")} className="block overflow-hidden bg-muted" style={{ aspectRatio: ratio.replace(":", "/"), borderRadius: radius }}>
          {image ? (
            <picture>
              {mob ? <source media="(max-width: 767px)" srcSet={mob.srcSet || mob.src} sizes={mob.sizes} /> : null}
              <Img src={desk?.src || image} srcSet={desk?.srcSet} sizes={desk?.sizes} alt={alt || ""} priority={i === 0} loading={i === 0 ? "eager" : "lazy"} className="h-full w-full object-cover" />
            </picture>
          ) : (
            <span className="grid h-full place-items-center text-sm font-bold">{alt}</span>
          )}
        </Link>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------- tabs */

export function TabsWidget({ widget }: { widget: WidgetNode }) {
  const rows = splitRows(propStr(widget.props, "items", ""))
  const [active, setActive] = useState(0)
  if (!rows.length) return null
  const current = rows[Math.min(active, rows.length - 1)]
  return (
    <div className="rounded-2xl border border-border bg-card">
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border p-2">
        {rows.map(([title], i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold ${i === active ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:bg-muted"}`}
          >
            {title}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="whitespace-pre-wrap p-5 text-sm leading-7 text-foreground/80">
        {current?.[1] ?? ""}
      </div>
    </div>
  )
}

/* -------------------------------------------------------- accordion / FAQ */

export function AccordionWidget({ widget }: { widget: WidgetNode }) {
  const rows = splitRows(propStr(widget.props, "items", "")).filter(([q]) => q)
  const title = propStr(widget.props, "title", "")
  const schema = propBool(widget.props, "faqSchema", true)
  const firstOpen = propBool(widget.props, "firstOpen", true)
  const [open, setOpen] = useState<number | null>(firstOpen ? 0 : null)
  const json = useMemo(
    () =>
      schema && rows.length
        ? JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: rows.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a ?? "" } })),
          }).replace(/</g, "\\u003c")
        : "",
    [rows, schema],
  )
  if (!rows.length) return null
  return (
    <section>
      <SectionTitle title={title} />
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {rows.map(([q, a], i) => {
          const isOpen = open === i
          return (
            <div key={i}>
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)} className="flex w-full items-center justify-between gap-3 p-4 text-start text-sm font-bold text-foreground">
                <span>{q}</span>
                <ChevronLeft size={16} className={`shrink-0 transition-transform ${isOpen ? "-rotate-90" : ""}`} />
              </button>
              {isOpen ? <div className="whitespace-pre-wrap px-4 pb-4 text-sm leading-7 text-foreground/75">{a}</div> : null}
            </div>
          )
        })}
      </div>
      {json ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} /> : null}
    </section>
  )
}

/* --------------------------------------------------------- icon box / list */

export function IconBoxWidget({ widget }: { widget: WidgetNode }) {
  const icon = propStr(widget.props, "icon", "badge")
  const title = propStr(widget.props, "title", "")
  const text = propStr(widget.props, "text", "")
  const href = propStr(widget.props, "href", "")
  const side = propStr(widget.props, "layout", "top") === "side"
  const body = (
    <div className={`flex h-full gap-3 rounded-2xl border border-border bg-card p-5 ${side ? "items-start" : "flex-col items-center text-center"}`}>
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
        <WIcon name={icon} />
      </span>
      <span>
        {title ? <strong className="block text-sm font-extrabold text-foreground">{title}</strong> : null}
        {text ? <span className="mt-1 block text-xs leading-6 text-foreground/70">{text}</span> : null}
      </span>
    </div>
  )
  return href ? <Link href={safeHref(href)} {...linkAttrs(widget.props, "href")}>{body}</Link> : body
}

export function IconListWidget({ widget }: { widget: WidgetNode }) {
  const rows = splitRows(propStr(widget.props, "items", ""))
  const inline = propStr(widget.props, "direction", "column") === "row"
  if (!rows.length) return null
  return (
    <ul className={`flex gap-3 ${inline ? "flex-wrap" : "flex-col"}`}>
      {rows.map(([icon, text, href], i) => {
        const inner = (
          <>
            <span className="text-primary">
              <WIcon name={icon || "badge"} size={18} />
            </span>
            <span>{text}</span>
          </>
        )
        return (
          <li key={i} className="flex items-center gap-2 text-sm text-foreground/80">
            {href ? (
              <Link href={safeHref(href)} className="flex items-center gap-2 hover:text-primary">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        )
      })}
    </ul>
  )
}

/* ------------------------------------------------------------ testimonials */

type TestimonialRow = {
  id?: number
  author?: string
  name?: string
  role?: string | null
  company?: string | null
  quote?: string
  text?: string
  rating?: number | null
  avatar_url?: string | null
  image?: string | null
}

export function TestimonialsWidget({ widget }: { widget: WidgetNode }) {
  const title = propStr(widget.props, "title", "")
  const source = propStr(widget.props, "source", "module") || "module"
  const layout = propStr(widget.props, "layout", "strip") || "strip"
  const limit = Math.max(1, Math.min(24, propNum(widget.props, "limit", 8)))
  const manual = splitRows(propStr(widget.props, "items", "")).filter(([name, text]) => name || text)
  const [rows, setRows] = useState<TestimonialRow[] | null>(source === "manual" ? [] : null)

  useEffect(() => {
    if (source === "manual") {
      setRows(
        manual.slice(0, limit).map(([name, text, rating, avatar, role]) => ({
          name,
          text,
          rating: Number(rating) || null,
          image: avatar || null,
          role: role || null,
        })),
      )
      return
    }
    let cancel = false
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    fetch(`${base}/api/v1/public/testimonials?per_page=${limit}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancel) return
        const items = Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json?.data?.data)
            ? json.data.data
            : []
        setRows(items.slice(0, limit))
      })
      .catch(() => !cancel && setRows([]))
    return () => {
      cancel = true
    }
    // manual rows are only used when source=manual; intentional deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, limit, propStr(widget.props, "items", "")])

  if (!rows || !rows.length) {
    if (source === "manual" && !manual.length) return null
    if (source !== "manual" && rows && !rows.length) return null
    if (rows === null) {
      return (
        <section>
          <SectionTitle title={title} />
          <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-foreground/60">در حال بارگذاری نظرات…</div>
        </section>
      )
    }
    return null
  }

  const trackClass =
    layout === "slider"
      ? "flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 scroll-smooth"
      : "flex snap-x gap-3 overflow-x-auto pb-2"

  return (
    <section dir="rtl">
      <SectionTitle title={title} />
      <div className={trackClass}>
        {rows.map((row, i) => {
          const name = row.author || row.name || ""
          const text = row.quote || row.text || ""
          const role = [row.role, row.company].filter(Boolean).join(" · ")
          const avatar = row.avatar_url || row.image || ""
          const stars = Math.max(0, Math.min(5, Number(row.rating) || 0))
          return (
            <figure key={row.id ?? i} className="w-72 shrink-0 snap-start rounded-2xl border border-border bg-card p-5">
              {stars ? (
                <div className="mb-2 flex gap-0.5 text-[var(--sfc-rating,#f9bc00)]" aria-label={`${stars} / 5`}>
                  {Array.from({ length: stars }).map((_, k) => (
                    <Star key={k} size={14} fill="currentColor" />
                  ))}
                </div>
              ) : null}
              <blockquote className="text-sm leading-7 text-foreground/80">{text}</blockquote>
              <figcaption className="mt-3 flex items-center gap-2 text-xs font-bold text-foreground">
                {avatar ? <Img src={avatar} alt="" className="size-8 rounded-full object-cover" loading="lazy" /> : null}
                <span>
                  <span className="block">{name}</span>
                  {role ? <span className="block text-[11px] font-medium text-foreground/60">{role}</span> : null}
                </span>
              </figcaption>
            </figure>
          )
        })}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------ brand slider */

export function BrandSliderWidget({ widget }: { widget: WidgetNode }) {
  const catalog = useCatalog(48)
  const title = propStr(widget.props, "title", "")
  const limit = Math.max(1, propNum(widget.props, "limit", 12))
  const showNames = propBool(widget.props, "showNames", true)
  const logos = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of catalog.products) {
      const key = p.brandSlug || p.brand
      if (key && p.image && !map.has(key)) map.set(key, p.image)
    }
    return map
  }, [catalog.products])
  const brands = catalog.brands.slice(0, limit)
  if (!brands.length) return null
  return (
    <section>
      <SectionTitle title={title} href="/shop" />
      <div className="flex snap-x gap-3 overflow-x-auto pb-2">
        {brands.map((brand) => {
          const logo = (brand as { image?: string | null }).image || logos.get(brand.slug) || logos.get(brand.name)
          return (
            <Link key={brand.slug} href={`/shop?brand=${encodeURIComponent(brand.slug)}`} className="grid w-32 shrink-0 snap-start place-items-center gap-2 rounded-2xl border border-border bg-card p-3 text-center">
              <span className="grid size-16 place-items-center overflow-hidden rounded-xl bg-muted">
                {logo ? <Img src={logo} alt="" loading="lazy" className="h-full w-full object-contain" /> : <span className="text-xs font-bold">{brand.name}</span>}
              </span>
              {showNames ? <span className="text-xs font-semibold text-foreground">{brand.name}</span> : null}
            </Link>
          )
        })}
      </div>
    </section>
  )
}

/* ---------------------------------------------------- gallery & carousel */

export function ImageGalleryWidget({ widget }: { widget: WidgetNode }) {
  const rows = splitRows(propStr(widget.props, "images", "")).filter(([src]) => src)
  const cols = Math.max(1, Math.min(6, propNum(widget.props, "columns", 3)))
  const lightbox = propBool(widget.props, "lightbox", true)
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => {
    if (open == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])
  if (!rows.length) return null
  return (
    <>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {rows.map(([src, alt], i) => (
          <button key={i} type="button" disabled={!lightbox} onClick={() => setOpen(i)} className="aspect-square overflow-hidden rounded-xl bg-muted">
            <Img src={src} alt={alt || ""} loading="lazy" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      {open != null && rows[open] ? (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[80] grid place-items-center bg-black/80 p-4" onClick={() => setOpen(null)}>
          <button type="button" aria-label="بستن" className="absolute end-4 top-4 rounded-full bg-white/15 p-2 text-white">
            <X size={20} />
          </button>
          <Img src={rows[open][0]} alt={rows[open][1] || ""} className="max-h-[85vh] max-w-full rounded-xl object-contain" />
        </div>
      ) : null}
    </>
  )
}

export function ImageCarouselWidget({ widget }: { widget: WidgetNode }) {
  const rows = splitRows(propStr(widget.props, "images", "")).filter(([src]) => src)
  const seconds = Math.max(0, propNum(widget.props, "autoplay", 5))
  const ratio = propStr(widget.props, "ratio", "16/6")
  const [index, setIndex] = useState(0)
  const count = rows.length
  useEffect(() => {
    if (count < 2 || !seconds) return
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), seconds * 1000)
    return () => window.clearInterval(timer)
  }, [count, seconds])
  if (!count) return null
  const [src, href, alt] = rows[Math.min(index, count - 1)]
  const img = <Img src={src} alt={alt || ""} className="h-full w-full object-cover" />
  return (
    <div className="relative overflow-hidden rounded-2xl bg-muted" style={{ aspectRatio: ratio.replace(":", "/") }}>
      {href ? <Link href={safeHref(href)}>{img}</Link> : img}
      {count > 1 ? (
        <>
          <button type="button" aria-label="قبلی" onClick={() => setIndex((i) => (i - 1 + count) % count)} className="absolute start-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white">
            <ChevronRight size={18} />
          </button>
          <button type="button" aria-label="بعدی" onClick={() => setIndex((i) => (i + 1) % count)} className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white">
            <ChevronLeft size={18} />
          </button>
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {rows.map((_, i) => (
              <button key={i} type="button" aria-label={String(i + 1)} onClick={() => setIndex(i)} className={`h-1.5 rounded-full ${i === index ? "w-5 bg-white" : "w-1.5 bg-white/60"}`} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------- announcement bar */

export function AnnouncementWidget({ widget }: { widget: WidgetNode }) {
  const text = propStr(widget.props, "text", "")
  const href = propStr(widget.props, "href", "")
  const bg = propStr(widget.props, "background", "")
  const color = propStr(widget.props, "color", "")
  const dismissible = propBool(widget.props, "dismissible", true)
  const key = `wb_announce_${widget.id}`
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    if (dismissible && window.localStorage.getItem(key) === "1") setHidden(true)
  }, [dismissible, key])
  if (!text || hidden) return null
  return (
    <div className="relative flex items-center justify-center gap-2 rounded-xl px-10 py-2.5 text-center text-sm font-semibold" style={{ background: bg || "var(--color-primary)", color: color || "var(--color-primary-foreground, #fff)" }}>
      {href ? <Link href={safeHref(href)} {...linkAttrs(widget.props, "href")}>{text}</Link> : <span>{text}</span>}
      {dismissible ? (
        <button
          type="button"
          aria-label="بستن"
          className="absolute end-3 top-1/2 -translate-y-1/2 opacity-80"
          onClick={() => {
            window.localStorage.setItem(key, "1")
            setHidden(true)
          }}
        >
          <X size={16} />
        </button>
      ) : null}
    </div>
  )
}

/* --------------------------------------------------------------------- map */

export function MapWidget({ widget }: { widget: WidgetNode }) {
  const lat = Number(propStr(widget.props, "lat", "35.6892"))
  const lng = Number(propStr(widget.props, "lng", "51.389"))
  const zoom = Math.max(3, Math.min(18, propNum(widget.props, "zoom", 15)))
  const height = Math.max(160, Math.min(800, propNum(widget.props, "height", 320)))
  const address = propStr(widget.props, "address", "")
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const d = 0.01 * Math.pow(2, 15 - zoom)
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d},${lat - d},${lng + d},${lat + d}&layer=mapnik&marker=${lat},${lng}`
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <iframe title={address || "map"} src={src} className="w-full border-0" style={{ height }} loading="lazy" referrerPolicy="no-referrer" />
      {address ? (
        <p className="flex items-center gap-2 p-3 text-sm text-foreground/80">
          <MapPin size={16} className="text-primary" /> {address}
        </p>
      ) : null}
    </div>
  )
}

/* ----------------------------------------------------------------- counter */

function useInView<T extends Element>(): [RefObject<T>, boolean] {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true)
      return
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setSeen(true)
    })
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  return [ref, seen]
}

export function CounterWidget({ widget }: { widget: WidgetNode }) {
  const rows = splitRows(propStr(widget.props, "items", "")).filter(([n]) => n)
  const [ref, seen] = useInView<HTMLDivElement>()
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (!seen) return
    let frame = 0
    const start = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 1200)
      setProgress(p)
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [seen])
  if (!rows.length) return null
  return (
    <div ref={ref} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {rows.map(([raw, label, suffix], i) => {
        const target = Number(raw.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[^\d.]/g, "")) || 0
        const value = Math.round(target * progress)
        return (
          <div key={i} className="rounded-2xl border border-border bg-card p-5 text-center">
            <strong className="block text-2xl font-black text-primary">
              {value.toLocaleString("fa-IR")}
              {suffix ? <span className="ms-1 text-base">{suffix}</span> : null}
            </strong>
            <span className="mt-1 block text-xs text-foreground/70">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------- social and share */

const NETWORK_LABEL: Record<string, string> = {
  instagram: "اینستاگرام",
  telegram: "تلگرام",
  whatsapp: "واتساپ",
  x: "ایکس",
  twitter: "ایکس",
  linkedin: "لینکدین",
  youtube: "یوتیوب",
  aparat: "آپارات",
  eitaa: "ایتا",
  bale: "بله",
  rubika: "روبیکا",
}

export function SocialIconsWidget({ widget }: { widget: WidgetNode }) {
  const rows = splitRows(propStr(widget.props, "items", "")).filter(([, href]) => href)
  if (!rows.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {rows.map(([network, href], i) => (
        <a key={i} href={safeHref(href)} target="_blank" rel="noopener noreferrer" className="rounded-full border border-border bg-card px-4 py-2 text-xs font-bold text-foreground hover:border-primary hover:text-primary">
          {NETWORK_LABEL[network.toLowerCase()] ?? network}
        </a>
      ))}
    </div>
  )
}

export function ShareButtonsWidget({ widget }: { widget: WidgetNode }) {
  const title = propStr(widget.props, "title", "اشتراک‌گذاری")
  const [url, setUrl] = useState("")
  const [copied, setCopied] = useState(false)
  useEffect(() => setUrl(window.location.href), [])
  const enc = encodeURIComponent(url)
  const links = [
    { id: "telegram", href: `https://t.me/share/url?url=${enc}` },
    { id: "whatsapp", href: `https://wa.me/?text=${enc}` },
    { id: "x", href: `https://x.com/intent/post?url=${enc}` },
    { id: "linkedin", href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc}` },
  ]
  return (
    <div className="flex flex-wrap items-center gap-2">
      {title ? <span className="text-sm font-bold text-foreground">{title}</span> : null}
      {links.map((l) => (
        <a key={l.id} href={url ? l.href : "#"} target="_blank" rel="noopener noreferrer" className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:text-primary">
          {NETWORK_LABEL[l.id]}
        </a>
      ))}
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:text-primary"
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(() => setCopied(true))
        }}
      >
        <Link2 size={14} /> {copied ? "کپی شد" : "کپی پیوند"}
      </button>
    </div>
  )
}

/* ----------------------------------------------------------------- pricing */

export function PricingWidget({ widget }: { widget: WidgetNode }) {
  const rows = splitRows(propStr(widget.props, "plans", "")).filter(([name]) => name)
  const cta = propStr(widget.props, "cta", "انتخاب")
  if (!rows.length) return null
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {rows.map(([name, price, features, href, featured], i) => {
        const hot = featured === "1" || featured === "true"
        return (
          <div key={i} className={`flex flex-col rounded-2xl border bg-card p-5 ${hot ? "border-primary shadow-lg" : "border-border"}`}>
            <strong className="text-base font-extrabold text-foreground">{name}</strong>
            {price ? <span className="mt-2 text-2xl font-black text-primary">{price}</span> : null}
            <ul className="mt-4 flex-1 space-y-2 text-sm text-foreground/75">
              {(features ?? "")
                .split(";")
                .map((f) => f.trim())
                .filter(Boolean)
                .map((f, k) => (
                  <li key={k} className="flex items-center gap-2">
                    <BadgeCheck size={14} className="text-primary" /> {f}
                  </li>
                ))}
            </ul>
            {href ? (
              <Link href={safeHref(href)} className={`mt-5 rounded-full px-4 py-2.5 text-center text-sm font-bold ${hot ? "bg-primary text-primary-foreground" : "border border-border text-foreground"}`}>
                {cta}
              </Link>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/* -------------------------------------------------------------- blog query */

type PostRow = { slug: string; title: string; excerpt?: string; cover_url?: string }

export function BlogPostsWidget({ widget }: { widget: WidgetNode }) {
  const title = propStr(widget.props, "title", "")
  const limit = Math.max(1, Math.min(12, propNum(widget.props, "limit", 3)))
  const layout = propStr(widget.props, "layout", "grid")
  const category = propStr(widget.props, "category", "")
  const [posts, setPosts] = useState<PostRow[] | null>(null)
  useEffect(() => {
    let cancel = false
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    const params = new URLSearchParams({ per_page: String(limit) })
    if (category) params.set("category", category)
    fetch(`${base}/api/v1/public/blog?${params}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancel) return
        const items = Array.isArray(json?.data) ? json.data : Array.isArray(json?.data?.items) ? json.data.items : []
        setPosts(items.slice(0, limit))
      })
      .catch(() => !cancel && setPosts([]))
    return () => {
      cancel = true
    }
  }, [category, limit])
  if (!posts || !posts.length) return null
  return (
    <section>
      <SectionTitle title={title} href="/blog" />
      <div className={layout === "list" ? "flex flex-col gap-3" : "grid gap-3 md:grid-cols-3"}>
        {posts.map((post) => (
          <Link key={post.slug} href={`/blog/${post.slug}`} className={`overflow-hidden rounded-2xl border border-border bg-card ${layout === "list" ? "flex gap-3" : "block"}`}>
            <span className={`block bg-muted ${layout === "list" ? "w-32 shrink-0" : "aspect-video"}`}>
              {post.cover_url ? <Img src={post.cover_url} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
            </span>
            <span className="block p-4">
              <strong className="line-clamp-2 text-sm font-extrabold text-foreground">{post.title}</strong>
              {post.excerpt ? <span className="mt-1 line-clamp-2 block text-xs leading-6 text-foreground/70">{post.excerpt}</span> : null}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

/* -------------------------------------------------------------- search box */

export function SearchBoxWidget({ widget }: { widget: WidgetNode }) {
  const router = useRouter()
  const placeholder = propStr(widget.props, "placeholder", "جستجوی محصول…")
  const button = propStr(widget.props, "button", "جستجو")
  const [q, setQ] = useState("")
  return (
    <form
      role="search"
      className="flex items-center gap-2 rounded-2xl border border-border bg-card p-2"
      onSubmit={(e) => {
        e.preventDefault()
        const v = q.trim()
        router.push(v ? `/shop?q=${encodeURIComponent(v)}` : "/shop")
      }}
    >
      <Search size={18} className="ms-2 text-foreground/50" aria-hidden="true" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-10 flex-1 bg-transparent text-sm outline-none" />
      <button type="submit" className="h-10 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">
        {button}
      </button>
    </form>
  )
}

/* ----------------------------------------------------------- category list */

export function CategoryListWidget({ widget }: { widget: WidgetNode }) {
  const catalog = useCatalog(16)
  const title = propStr(widget.props, "title", "")
  const parent = propStr(widget.props, "parent", "")
  const layout = propStr(widget.props, "layout", "list")
  const limit = Math.max(1, propNum(widget.props, "limit", 12))
  const items = useMemo(() => {
    const all = catalog.categories
    if (!parent) return all.filter((c) => !c.parentId).slice(0, limit)
    const root = all.find((c) => c.slug === parent)
    if (!root) return []
    const nested = root.children ?? []
    const flat = root.id ? all.filter((c) => c.parentId === root.id) : []
    return (nested.length ? nested : flat).slice(0, limit)
  }, [catalog.categories, limit, parent])
  if (!items.length) return null
  return (
    <section>
      <SectionTitle title={title} />
      <div className={layout === "chips" ? "flex flex-wrap gap-2" : "flex flex-col divide-y divide-border rounded-2xl border border-border bg-card"}>
        {items.map((c) => (
          <Link
            key={c.slug}
            href={`/shop?category=${encodeURIComponent(c.slug)}`}
            className={layout === "chips" ? "rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:text-primary" : "flex items-center justify-between px-4 py-3 text-sm text-foreground hover:text-primary"}
          >
            {c.name}
            {layout === "chips" ? null : <ChevronLeft size={14} />}
          </Link>
        ))}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------- login CTA */

export function LoginCtaWidget({ widget }: { widget: WidgetNode }) {
  const title = propStr(widget.props, "title", "ورود یا ثبت‌نام")
  const text = propStr(widget.props, "text", "")
  const button = propStr(widget.props, "button", "ورود به حساب")
  const next = propStr(widget.props, "next", "/account")
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center">
      <strong className="text-base font-extrabold text-foreground">{title}</strong>
      {text ? <p className="text-sm text-foreground/70">{text}</p> : null}
      <Link href={`/login?next=${encodeURIComponent(next.startsWith("/") ? next : "/account")}`} className="rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">
        {button}
      </Link>
    </div>
  )
}

/* -------------------------------------------- section intro (for chrome widgets) */

export function WidgetIntro({ widget, children }: { widget: WidgetNode; children: ReactNode }) {
  const title = propStr(widget.props, "title", "")
  const intro = propStr(widget.props, "intro", "")
  if (!title && !intro) return <>{children}</>
  return (
    <div>
      <div className="mx-auto max-w-6xl px-4 pt-4">
        {title ? <h2 className="text-lg font-extrabold text-foreground">{title}</h2> : null}
        {intro ? <p className="mt-1 text-sm text-foreground/70">{intro}</p> : null}
      </div>
      {children}
    </div>
  )
}

/* ------------------------------------------------- Instagram / social feed */

type FeedItem = { id?: string; image?: string; href?: string; caption?: string }

export function FeedWidget({ widget }: { widget: WidgetNode }) {
  const handle = propStr(widget.props, "handle", "").replace(/^@/, "")
  const profile = propStr(widget.props, "profileUrl", "") || (handle ? `https://www.instagram.com/${handle}/` : "https://www.instagram.com/")
  const title = propStr(widget.props, "title", "")
  const cols = Math.max(2, Math.min(6, propNum(widget.props, "columns", 4)))
  const limit = Math.max(1, Math.min(24, propNum(widget.props, "limit", 8)))
  const layout = propStr(widget.props, "layout", "grid") || "grid"
  const ctaLabel = propStr(widget.props, "ctaLabel", "مشاهده در اینستاگرام") || "مشاهده در اینستاگرام"
  const [items, setItems] = useState<FeedItem[] | null>(null)
  const [meta, setMeta] = useState<{ configured?: boolean; message?: string | null; profile_url?: string; handle?: string }>({})

  useEffect(() => {
    let cancel = false
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    const params = new URLSearchParams({ limit: String(limit) })
    if (handle) params.set("handle", handle)
    fetch(`${base}/api/v1/public/instagram-feed?${params}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancel) return
        const list = Array.isArray(json?.data) ? json.data : []
        setItems(list.slice(0, limit))
        setMeta(json?.meta && typeof json.meta === "object" ? json.meta : {})
      })
      .catch(() => {
        if (!cancel) {
          setItems([])
          setMeta({ configured: false, message: null })
        }
      })
    return () => {
      cancel = true
    }
  }, [handle, limit])

  const profileHref = safeHref(meta.profile_url || profile)
  const shownHandle = (meta.handle || handle || "").replace(/^@/, "")

  if (items === null) {
    return (
      <section dir="rtl">
        <div className="mb-3 flex items-center justify-between gap-3">
          {title ? <h2 className="text-lg font-extrabold text-foreground">{title}</h2> : <span />}
        </div>
        <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-foreground/60">در حال بارگذاری فید…</div>
      </section>
    )
  }

  if (!items.length) {
    return (
      <section dir="rtl" className="rounded-2xl border border-border bg-card p-6 text-center">
        {title ? <h2 className="text-lg font-extrabold text-foreground">{title}</h2> : null}
        <p className="mt-2 text-sm text-foreground/70">
          {meta.message || "فید اینستاگرام هنوز آماده نیست. حساب را در تنظیمات سایت وصل کنید یا از پروفایل دنبال کنید."}
        </p>
        <a
          href={profileHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground"
          dir="ltr"
        >
          {shownHandle ? `@${shownHandle}` : ctaLabel}
        </a>
      </section>
    )
  }

  const list = (
    <>
      {items.map((row, i) => {
        const src = row.image || ""
        if (!src) return null
        const img = <Img src={src} alt={row.caption || ""} loading="lazy" className="h-full w-full object-cover transition-transform hover:scale-105" />
        return (
          <div key={row.id || i} className={`overflow-hidden rounded-xl bg-muted ${layout === "strip" ? "aspect-square w-40 shrink-0 snap-start" : "aspect-square"}`}>
            {row.href ? (
              <a href={safeHref(row.href)} target="_blank" rel="noopener noreferrer" aria-label={row.caption || "پست اینستاگرام"}>
                {img}
              </a>
            ) : (
              img
            )}
          </div>
        )
      })}
    </>
  )

  return (
    <section dir="rtl">
      <div className="mb-3 flex items-center justify-between gap-3">
        {title ? <h2 className="text-lg font-extrabold text-foreground">{title}</h2> : <span />}
        <a href={profileHref} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-primary" dir="ltr">
          {shownHandle ? `@${shownHandle}` : "Instagram"}
        </a>
      </div>
      {layout === "strip" ? (
        <div className="flex snap-x gap-2 overflow-x-auto pb-2">{list}</div>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {list}
        </div>
      )}
    </section>
  )
}
