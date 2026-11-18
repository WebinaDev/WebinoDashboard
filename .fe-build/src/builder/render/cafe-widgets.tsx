"use client"

/* Cafe / bakery builder widgets — tones: saloon, bakery, espresso, light */

import Link from "next/link"

import { BuilderPrice, PriceOrText } from "../money"
import { useEffect, useState, type CSSProperties } from "react"

import { parseRows, propBool, propNum, propStr } from "../props"
import type { WidgetNode } from "../types"
import { CAFE_CATEGORIES_KEY, CAFE_VENUE_KEY, cafeMenuCount, cafeMenuKey } from "../cafe-keys"
import { useBuilderRuntime } from "./runtime"
import { Img } from "./img"
import "./cafe-widgets.css"
import "./cafe-light-chrome.css"

function safeHref(href: string, fallback = "#"): string {
  const v = (href || "").trim()
  if (!v) return fallback
  return /^(https?:|mailto:|tel:|\/|#)/i.test(v) ? v : fallback
}

function safeMedia(src: string): string {
  const s = (src || "").trim()
  return s.startsWith("/") || /^https?:\/\//i.test(s) ? s : ""
}

const CSS_SAFE = /^[#a-z0-9(),.\s%-]+$/i
const DAY_FA: Record<string, string> = {
  saturday: "شنبه",
  sunday: "یکشنبه",
  monday: "دوشنبه",
  tuesday: "سه‌شنبه",
  wednesday: "چهارشنبه",
  thursday: "پنجشنبه",
  friday: "جمعه",
}

function shell(p: Record<string, unknown>, extra = "") {
  const tone = propStr(p, "tone", "saloon")
  const toneCls =
    tone === "bakery" ? "wcx-bakery" : tone === "espresso" ? "wcx-espresso" : tone === "light" ? "wcx-light" : "wcx-saloon"
  const bg = propStr(p, "bgImage") ? "wcx-has-bg" : ""
  const bleed = propBool(p, "fullBleed", false) ? "wcx-bleed" : ""
  const motion = propBool(p, "motion", false) ? "wcx-motion" : ""
  return `wcx wcx-pad ${toneCls} ${bg} ${bleed} ${motion} ${extra}`.trim()
}

function sectionBg(p: Record<string, unknown>): CSSProperties {
  const img = propStr(p, "bgImage").replace(/["\\()]/g, "")
  const ov = propStr(p, "bgOverlay")
  const op = Math.max(0, Math.min(100, propNum(p, "bgOverlayOpacity", 55)))
  const v: Record<string, string> = {}
  if (img && /^(https?:\/\/|\/)/.test(img)) v["--wcx-bg-img"] = `url("${img}")`
  if (ov && CSS_SAFE.test(ov)) v["--wcx-ov"] = ov
  v["--wcx-ov-op"] = String(op / 100)
  return v as CSSProperties
}

function Head({ title, subtitle }: { title: string; subtitle: string }) {
  if (!title && !subtitle) return null
  return (
    <header className="wcx-head wcx-rise">
      {title ? <h2>{title}</h2> : null}
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  )
}


/** priceMinor: live catalog amount in `currency` units (IRR by default); price: manual text in store currency. */
type MenuRow = { title: string; price: string; priceMinor?: number; originalMinor?: number; currency?: string; desc: string; category: string; image: string; href: string }
type CatRow = { title: string; href: string; image: string; slug?: string }
type GalleryRow = { url: string; caption: string }
type HoursDay = { day: string; open: string; close: string; closed?: boolean }

type VenueData = {
  hours?: { days?: HoursDay[]; timezone?: string }
  gallery?: { images?: Array<{ url?: string; caption_fa?: string; caption_en?: string }> }
  venue?: { about_fa?: string; tagline_fa?: string; phone?: string; address_fa?: string }
}

/** SSR seed from server-prefetch.ts (runtime.prefetch); undefined when the server did not prefetch the key. */
function usePrefetched<T>(key: string): T | undefined {
  const pre = (useBuilderRuntime() as { prefetch?: Record<string, unknown> }).prefetch
  return pre && key in pre ? (pre[key] as T) : undefined
}

function useCafeVenue(enabled: boolean) {
  const seed = usePrefetched<VenueData | null>(CAFE_VENUE_KEY)
  const [data, setData] = useState<VenueData | null>(seed ?? null)
  useEffect(() => {
    if (!enabled || seed !== undefined) return
    let dead = false
    ;(async () => {
      try {
        const res = await fetch("/api/v1/public/cafe/venue", {
          credentials: "same-origin",
          headers: typeof window !== "undefined" ? { "X-Tenant-Domain": window.location.host } : undefined,
        })
        const json = (await res.json()) as { data?: VenueData }
        if (!dead) setData(json?.data ?? null)
      } catch {
        if (!dead) setData(null)
      }
    })()
    return () => {
      dead = true
    }
  }, [enabled, seed])
  return data
}

type LiveItem = {
  name?: string
  slug?: string
  short_description?: string
  description?: string
  image_url?: string
  price_minor?: number
  discounted_price_minor?: number
  currency?: string
  category?: { name?: string; slug?: string }
}

/** Public catalog is `{ data: { items, categories, ... } }`; older payloads were a bare array. */
function menuRowsFrom(json: unknown, count: number): MenuRow[] {
  const d = (json as { data?: LiveItem[] | { items?: LiveItem[] } } | null)?.data
  const list: LiveItem[] = Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : []
  return list.slice(0, count).map((p) => ({
    title: String(p.name || ""),
    price: "",
    priceMinor: Number(p.discounted_price_minor) || Number(p.price_minor) || 0,
    originalMinor: Number(p.discounted_price_minor) > 0 && Number(p.price_minor) > Number(p.discounted_price_minor) ? Number(p.price_minor) : 0,
    currency: String(p.currency || "IRT"),
    desc: String(p.short_description || p.description || ""),
    category: String(p.category?.name || ""),
    image: String(p.image_url || ""),
    href: p.slug ? `/catalogue?item=${p.slug}` : "/catalogue",
  }))
}

function useCafeCatalog(enabled: boolean, count: number, category: string) {
  const key = cafeMenuKey(count, category)
  const seed = usePrefetched<unknown>(key)
  const [rows, setRows] = useState<MenuRow[] | null>(seed !== undefined ? menuRowsFrom(seed, count) : null)
  useEffect(() => {
    if (!enabled || seed !== undefined) return
    let dead = false
    ;(async () => {
      try {
        const res = await fetch(`/api/v1/public/catalog?${key.slice("catalog::".length)}`, { credentials: "same-origin" })
        const json = await res.json()
        if (!dead) setRows(menuRowsFrom(json, count))
      } catch {
        if (!dead) setRows([])
      }
    })()
    return () => {
      dead = true
    }
  }, [enabled, key, count, seed])
  return rows
}

type LiveCat = { name?: string; slug?: string; image_url?: string; cover_image_url?: string; icon_url?: string }

function catRowsFrom(raw: unknown, baseHref: string): CatRow[] {
  const json = raw as {
    data?: { categories?: LiveCat[] }
    meta?: { facets?: { categories?: LiveCat[] } }
    facets?: { categories?: LiveCat[] }
  } | null
  const cats: LiveCat[] = json?.data?.categories || json?.meta?.facets?.categories || json?.facets?.categories || []
  return cats.map((c) => {
    const slug = String(c.slug || "")
    const href = (baseHref || "/menu?category={slug}").replace("{slug}", slug)
    return { title: String(c.name || slug), href: safeHref(href, "/menu"), image: String(c.image_url || c.cover_image_url || c.icon_url || ""), slug }
  })
}

function useCafeCategories(enabled: boolean, baseHref: string) {
  const seed = usePrefetched<unknown>(CAFE_CATEGORIES_KEY)
  const [raw, setRaw] = useState<unknown>(seed ?? null)
  useEffect(() => {
    if (!enabled || seed !== undefined) return
    let dead = false
    ;(async () => {
      try {
        const res = await fetch(`/api/v1/public/catalog?${CAFE_CATEGORIES_KEY.slice("catalog::".length)}`, { credentials: "same-origin" })
        const json = await res.json()
        if (!dead) setRaw(json)
      } catch {
        if (!dead) setRaw({})
      }
    })()
    return () => {
      dead = true
    }
  }, [enabled, seed])
  return raw == null ? null : catRowsFrom(raw, baseHref)
}

export function CafeHeroWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const layout = propStr(p, "layout", "overlay")
  const logo = safeMedia(propStr(p, "logo"))
  const image = safeMedia(propStr(p, "image"))
  const title = propStr(p, "title", "کافه")
  const text = propStr(p, "text")
  const eyebrow = propStr(p, "eyebrow")
  const primaryLabel = propStr(p, "primaryLabel")
  const secondaryLabel = propStr(p, "secondaryLabel")
  const primaryHref = safeHref(propStr(p, "primaryHref"), "/menu")
  const secondaryHref = safeHref(propStr(p, "secondaryHref"), "/reservations")
  const bgProps = image && layout === "overlay" ? { ...p, bgImage: propStr(p, "bgImage") || image } : p

  const ctas = (
    <div className="wcx-cta wcx-rise">
      {primaryLabel ? (
        <Link className="wcx-btn wcx-btn-primary" href={primaryHref}>
          {primaryLabel}
        </Link>
      ) : null}
      {secondaryLabel ? (
        <Link className="wcx-btn wcx-btn-ghost" href={secondaryHref}>
          {secondaryLabel}
        </Link>
      ) : null}
    </div>
  )

  if (layout === "split") {
    return (
      <section className={shell(p, "wcx-hero-split")} style={sectionBg(p)}>
        <div className="wcx-rise">
          {eyebrow ? <div className="wcx-eyebrow">{eyebrow}</div> : null}
          {logo ? <Img className="wcx-logo" src={logo} alt={title} /> : null}
          <h1>{title}</h1>
          {text ? <p className="wcx-lead">{text}</p> : null}
          {ctas}
        </div>
        {image ? (
          <div className="wcx-media">
            <Img src={image} alt={propStr(p, "imageAlt", title)} />
          </div>
        ) : null}
      </section>
    )
  }

  return (
    <section className={shell(bgProps, "wcx-hero")} style={sectionBg(bgProps)}>
      <div className="wcx-hero-inner wcx-rise">
        {eyebrow ? <div className="wcx-eyebrow">{eyebrow}</div> : null}
        {logo ? <Img className="wcx-logo" src={logo} alt={title} /> : null}
        <h1>{title}</h1>
        {text ? <p className="wcx-lead">{text}</p> : null}
        {ctas}
      </div>
    </section>
  )
}

export function CafeMenuBoardWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const source = propStr(p, "source", "live")
  const count = cafeMenuCount(propNum(p, "count", 12))
  const category = propStr(p, "category")
  const layout = propStr(p, "layout", "board")
  const live = useCafeCatalog(source === "live", count, category)
  const manual = parseRows(p.items, ["title", "price", "desc", "category", "image"]).filter((r) => r.title)
  const rows: MenuRow[] =
    source === "manual"
      ? manual.map((r) => ({ title: r.title, price: r.price, desc: r.desc, category: r.category, image: r.image, href: "/menu" }))
      : live ?? []
  const menuHref = safeHref(propStr(p, "menuHref"), "/menu")
  const menuLabel = propStr(p, "menuLabel", "مشاهده کامل منو")

  return (
    <section className={shell(p)}>
      <Head title={propStr(p, "title")} subtitle={propStr(p, "subtitle")} />
      {rows.length === 0 ? <p className="wcx-empty">هنوز آیتمی برای نمایش نیست.</p> : null}
      {layout === "cards" || layout === "bakery" ? (
        <div className={layout === "bakery" ? "wcx-bakery-grid" : "wcx-cards"}>
          {rows.map((r, i) => (
            <article className="wcx-card" key={`${r.title}-${i}`}>
              {r.image ? <Img src={safeMedia(r.image)} alt={r.title} /> : null}
              <div className="wcx-card-body">
                <h3>{r.title}</h3>
                {r.desc ? <p>{r.desc}</p> : null}
                {r.priceMinor ? <div className="wcx-price"><BuilderPrice amount={r.priceMinor} original={r.originalMinor} from={r.currency} /></div> : r.price ? <div className="wcx-price"><PriceOrText value={r.price} /></div> : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="wcx-board">
          {rows.map((r, i) => (
            <div className="wcx-board-row" key={`${r.title}-${i}`}>
              <div>
                <strong>{r.title}</strong>
                {r.desc ? <em>{r.desc}</em> : null}
              </div>
              {r.priceMinor ? <div className="wcx-price"><BuilderPrice amount={r.priceMinor} original={r.originalMinor} from={r.currency} /></div> : r.price ? <div className="wcx-price"><PriceOrText value={r.price} /></div> : null}
            </div>
          ))}
        </div>
      )}
      {menuLabel ? (
        <div className="wcx-more">
          <Link className="wcx-btn wcx-btn-ghost" href={menuHref}>
            {menuLabel}
          </Link>
        </div>
      ) : null}
    </section>
  )
}

export function CafeHoursWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const source = propStr(p, "source", "live")
  const venue = useCafeVenue(source === "live")
  const manual = parseRows(p.days, ["day", "open", "close"]).filter((r) => r.day)
  const days: HoursDay[] =
    source === "manual"
      ? manual.map((r) => ({ day: r.day, open: r.open, close: r.close, closed: !r.open }))
      : venue?.hours?.days ?? []
  const phone = propStr(p, "phone") || venue?.venue?.phone || ""
  const address = propStr(p, "address") || venue?.venue?.address_fa || ""

  return (
    <section className={shell(p)}>
      <div className="wcx-hours">
        <div>
          <Head title={propStr(p, "title", "ساعت کاری")} subtitle={propStr(p, "note")} />
          <div className="wcx-hours-list">
            {days.length === 0 ? <p className="wcx-empty">ساعت کاری تنظیم نشده.</p> : null}
            {days.map((d) => (
              <div className="wcx-hours-row" key={d.day}>
                <span>{DAY_FA[d.day] || d.day}</span>
                <span className="wcx-price">{d.closed ? "تعطیل" : `${d.open} – ${d.close}`}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="wcx-meta wcx-rise">
          {address ? <p>{address}</p> : null}
          {phone ? (
            <p>
              تلفن: <a href={`tel:${phone.replace(/\s+/g, "")}`}>{phone}</a>
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export function CafeGalleryWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const source = propStr(p, "source", "live")
  const venue = useCafeVenue(source === "live")
  const manual = parseRows(p.images, ["url", "caption"]).filter((r) => r.url)
  const rows: GalleryRow[] =
    source === "manual"
      ? manual.map((r) => ({ url: r.url, caption: r.caption }))
      : (venue?.gallery?.images || []).map((img) => ({
          url: String(img.url || ""),
          caption: String(img.caption_fa || img.caption_en || ""),
        }))

  return (
    <section className={shell(p)}>
      <Head title={propStr(p, "title")} subtitle={propStr(p, "subtitle")} />
      {rows.length === 0 ? <p className="wcx-empty">گالری خالی است.</p> : null}
      <div className="wcx-gallery">
        {rows.slice(0, 8).map((r, i) => (
          <figure key={`${r.url}-${i}`}>
            {safeMedia(r.url) ? <Img src={safeMedia(r.url)} alt={r.caption || `gallery-${i + 1}`} /> : null}
            {r.caption ? <figcaption>{r.caption}</figcaption> : null}
          </figure>
        ))}
      </div>
    </section>
  )
}

export function CafeStoryWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const venue = useCafeVenue(propStr(p, "source", "venue") === "venue")
  const image = safeMedia(propStr(p, "image"))
  const manual = propStr(p, "text")
  const text = manual || venue?.venue?.about_fa || venue?.venue?.tagline_fa || ""

  return (
    <section className={shell(p)} style={sectionBg(p)}>
      <div className="wcx-story">
        {image ? (
          <div className="wcx-media wcx-rise">
            <Img src={image} alt={propStr(p, "imageAlt", propStr(p, "title"))} />
          </div>
        ) : null}
        <div className="wcx-copy wcx-rise">
          {propStr(p, "eyebrow") ? <div className="wcx-eyebrow">{propStr(p, "eyebrow")}</div> : null}
          <h2>{propStr(p, "title")}</h2>
          {text ? <p>{text}</p> : null}
        </div>
      </div>
    </section>
  )
}

export function CafeReserveCtaWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  return (
    <section className={shell(p)} style={sectionBg(p)}>
      <div className="wcx-reserve wcx-rise">
        <h2>{propStr(p, "title")}</h2>
        {propStr(p, "text") ? <p>{propStr(p, "text")}</p> : null}
        <div className="wcx-cta">
          {propStr(p, "primaryLabel") ? (
            <Link className="wcx-btn wcx-btn-primary" href={safeHref(propStr(p, "primaryHref"), "/reservations")}>
              {propStr(p, "primaryLabel")}
            </Link>
          ) : null}
          {propStr(p, "secondaryLabel") ? (
            <Link className="wcx-btn wcx-btn-ghost" href={safeHref(propStr(p, "secondaryHref"), "#")}>
              {propStr(p, "secondaryLabel")}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export function CafeCategoryStripWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const source = propStr(p, "source", "live")
  const baseHref = propStr(p, "baseHref", "/menu?category={slug}")
  const live = useCafeCategories(source === "live", baseHref)
  const manual = parseRows(p.items, ["title", "href", "image"]).filter((r) => r.title)
  const rows: CatRow[] =
    source === "manual"
      ? manual.map((r) => ({ title: r.title, href: safeHref(r.href, "/menu"), image: r.image }))
      : live ?? []

  return (
    <section className={shell(p)}>
      <Head title={propStr(p, "title")} subtitle="" />
      {rows.length === 0 ? <p className="wcx-empty">دسته‌ای یافت نشد.</p> : null}
      <div className="wcx-cats">
        {rows.map((r, i) => (
          <Link
            key={`${r.title}-${i}`}
            className="wcx-cat"
            href={r.href}
            style={safeMedia(r.image) ? ({ ["--wcx-cat-img" as string]: `url("${safeMedia(r.image)}")` } as CSSProperties) : undefined}
          >
            <span>{r.title}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
