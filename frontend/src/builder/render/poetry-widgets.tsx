"use client"

/* Poetry / Muharram blog widgets (crimson + cream, arch frames, Islamic pattern background).
 * Theme tokens live in poetry-widgets.css (--wpz-*); every widget accepts `tone` (light|dark),
 * `frame` (arch|rounded|square) and `pattern` (bool) where relevant. Repeaters use the shared
 * `a|b|c` per-line format so they edit with the same RepeaterInput as other widgets. */

import { ArrowLeft, BookOpen, Flame, Moon, MoreVertical, Music, Pause, Play, Quote, ShoppingBag, Star, Video } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
import type React from "react"

import { parseRows, propBool, propNum, propStr } from "../props"
import type { WidgetNode } from "../types"
import { PhotoSlot, apiV1, isDemoProduct, useCatalog } from "./poetry-pages-widgets"
import { useBuilderRuntime } from "./runtime"
import "./poetry-widgets.css"
import { optImg } from "@/lib/image-url"
import { sectionIsDark } from "./contrast"
import { DEFAULT_POEM_HREF, poemHref } from "./poem-href"
import { WpzCarousel, clampSpv, type CarouselOpts } from "./wpz-carousel"

const FA = "۰۱۲۳۴۵۶۷۸۹"
export const faNum = (v: string | number) => String(v).replace(/\d/g, (d) => FA[Number(d)])

export function safeHref(href: string, fallback = "#"): string {
  const v = (href || "").trim()
  if (!v) return fallback
  return /^(https?:|mailto:|tel:|\/|#)/i.test(v) ? v : fallback
}

export function formatToman(raw: string): string {
  const n = Number(String(raw).replace(/[^\d]/g, ""))
  if (!raw || !Number.isFinite(n) || n <= 0) return raw || ""
  return `${faNum(n.toLocaleString("en-US").replace(/,/g, "٬"))} تومان`
}

function frameClass(p: Record<string, unknown>, def = "arch") {
  const f = propStr(p, "frame", def)
  return f === "rounded" ? "wpz-frame-rounded" : f === "square" ? "wpz-frame-square" : "wpz-frame-arch"
}

function shell(p: Record<string, unknown>, extra: string, defTone = "light") {
  const t = propStr(p, "tone", defTone)
  const tone = t === "dark" ? "wpz-dark" : t === "transparent" ? "wpz-clear" : "wpz-light"
  const bg = propStr(p, "bgImage") ? "wpz-has-bg" : ""
  const mfw = propBool(p, "mobileFullWidth", true) ? "wpz-mfw" : ""
  // Dark tone, image+dark overlay, or a dark bg colour → light text tokens cascade from the section.
  const dark = sectionIsDark({ tone: t, bgImage: propStr(p, "bgImage"), bgOverlay: propStr(p, "bgOverlay"), bgOverlayOpacity: propNum(p, "bgOverlayOpacity", 70), bgColor: propStr(p, "bgColor") || propStr(p, "sectionBg") })
  return `wpz ${tone} ${dark ? "wpz-on-dark" : ""} ${propBool(p, "pattern", false) ? "wpz-pattern" : ""} ${bg} ${mfw} ${extra}`
}

const CSS_SAFE = /^[#a-z0-9(),.\s%-]+$/i
/** Shared section background: image (cover) + colour/gradient overlay with opacity (0–100). */
export function sectionBg(p: Record<string, unknown>): CSSProperties {
  const img = propStr(p, "bgImage").replace(/["\\()]/g, "")
  const ov = propStr(p, "bgOverlay")
  const op = Math.max(0, Math.min(100, propNum(p, "bgOverlayOpacity", 70)))
  const v: Record<string, string> = {}
  if (img && /^(https?:\/\/|\/)/.test(img)) v["--wpz-bg-img"] = `url("${img}")`
  if (ov && CSS_SAFE.test(ov)) v["--wpz-ov"] = ov
  v["--wpz-ov-op"] = String(op / 100)
  v["--wpz-mpy"] = `${Math.max(0, Math.min(160, propNum(p, "mobilePaddingY", 44)))}px`
  v["--wpz-mgap"] = `${Math.max(0, Math.min(160, propNum(p, "mobileGap", 28)))}px`
  return v as CSSProperties
}

const ICONS: Record<string, typeof Flame> = { flame: Flame, moon: Moon, star: Star, book: BookOpen, music: Music, video: Video }
const Ico = ({ name, className }: { name: string; className?: string }) => {
  const I = ICONS[name] ?? Star
  return <I className={className} aria-hidden />
}

/** layout: carousel (default) | grid; legacy "scroll" = carousel. */
export function carouselOpts(p: Record<string, unknown>, defDesktop: number): { carousel: boolean; opts: CarouselOpts } {
  const layout = propStr(p, "layout", "carousel")
  return {
    carousel: layout !== "grid",
    opts: {
      desktop: clampSpv(propNum(p, "slidesDesktop", defDesktop), defDesktop),
      mobile: clampSpv(propNum(p, "slidesMobile", 1.3), 1.3),
      autoplay: propBool(p, "autoplay", false),
      interval: Math.max(2, Math.min(30, propNum(p, "autoplayInterval", 5))),
    },
  }
}

/** 1) hero: side image, eyebrow, big title, two CTAs, vertical couplet. */
export function PoetryHeroWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const img = propStr(p, "image")
  const couplet = propStr(p, "couplet").split("\n").map((s) => s.trim()).filter(Boolean)
  return (
    <section className={shell(p, "wpz-hero", "light")} style={sectionBg(p)} dir="rtl">
      <div className="wpz-hero-text">
        {propStr(p, "eyebrow") ? <span className="wpz-eyebrow">{propStr(p, "eyebrow")}</span> : null}
        <h1 className="wpz-hero-title">{propStr(p, "title")}</h1>
        {propStr(p, "text") ? <p className="wpz-hero-sub">{propStr(p, "text")}</p> : null}
        <div className="wpz-actions">
          {propStr(p, "primaryLabel") ? <Link className="wpz-btn wpz-btn-primary" href={safeHref(propStr(p, "primaryHref"))}>{propStr(p, "primaryLabel")}</Link> : null}
          {propStr(p, "secondaryLabel") ? <Link className="wpz-btn wpz-btn-ghost" href={safeHref(propStr(p, "secondaryHref"))}>{propStr(p, "secondaryLabel")}</Link> : null}
        </div>
      </div>
      <div className="wpz-hero-media">
        {img && propStr(p, "photoMode", "photo") === "photo" ? <img loading="eager" fetchPriority="high" decoding="async" {...optImg(img, undefined, true)} alt={propStr(p, "imageAlt")} className={`wpz-img ${frameClass(p)}`} /> : <div className={`akx wpz-img ${frameClass(p)}`}><PhotoSlot mode={propStr(p, "photoMode", "photo")} logo={propStr(p, "logo")} alt={propStr(p, "imageAlt")} /></div>}
        {couplet.length ? (
          <div className="wpz-couplet" aria-label="بیت">
            {couplet.map((line, i) => <span key={i}>{line}</span>)}
          </div>
        ) : null}
      </div>
    </section>
  )
}

/** 2) latest poems: number, title, occasion tag, play with duration, item menu. */
type LiveRow = { title: string; tag: string; audio: string; duration: string; href: string; image?: string }

function useLatestPoems(count: number, sort: string, detailHref: string): LiveRow[] {
  const qs = new URLSearchParams({ per_page: String(count), ...(sort === "popular" ? { sort } : {}) })
  const pre = (useBuilderRuntime() as { prefetch?: Record<string, unknown> }).prefetch
  const seedRaw = count && pre ? pre[`/v1/public/poetry/poems?${qs}`] : undefined
  const toRows = (data: { id?: number | string; slug: string; title: string; occasion?: { name?: string } | null; image?: string | null; cover?: string | null }[]): LiveRow[] =>
    data.map((c) => ({ title: c.title, tag: c.occasion?.name ?? "", audio: "", duration: "", href: poemHref(detailHref, c), image: c.image || c.cover || "" }))
  const seed = Array.isArray(seedRaw) ? toRows(seedRaw) : null
  const [rows, setRows] = useState<LiveRow[]>(() => seed ?? [])
  useEffect(() => {
    if (!count || seed) return
    let off = false
    fetch(apiV1(`public/poetry/poems?${qs}`), { headers: { Accept: "application/json" }, credentials: "include" })
      .then((r) => (r.ok ? r.json() : {}) as Promise<{ data?: { slug: string; title: string; occasion?: { name?: string } | null; image?: string | null; cover?: string | null }[] }>)
      .then((j) => {
        if (off) return
        setRows(toRows(j.data ?? []))
      })
      .catch(() => !off && setRows([]))
    return () => { off = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, sort, detailHref])
  return seed ?? rows
}

export function PoemListWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const manual = parseRows(p.items, ["title", "tag", "audio", "duration", "href", "image"]).filter((r) => r.title)
  // Live by default: latest published poems from the poetry module; manual rows win only when set.
  const live = useLatestPoems(manual.length ? 0 : Math.min(24, Math.max(1, propNum(p, "count", 6))), propStr(p, "sort"), propStr(p, "detailHref", DEFAULT_POEM_HREF))
  const rows = manual.length ? manual : live
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState<number | null>(null)
  const [menu, setMenu] = useState<number | null>(null)
  const toggle = (i: number, src: string) => {
    const a = audioRef.current
    if (!a || !src) return
    if (playing === i) { a.pause(); setPlaying(null); return }
    a.src = src
    void a.play().then(() => setPlaying(i)).catch(() => setPlaying(null))
  }
  return (
    <section className={shell(p, "wpz-section", "light")} style={sectionBg(p)} dir="rtl">
      {propStr(p, "title") ? <h2 className="wpz-h2">{propStr(p, "title")}</h2> : null}
      {!rows.length ? <p className="wpz-empty">هنوز شعری منتشر نشده است.</p> : (
        <ol className="wpz-poems">
          {rows.map((r, i) => (
            <li key={i} className="wpz-poem">
              {r.image ? <img src={r.image} alt="" className="wpz-poem-thumb" loading="lazy" /> : null}
              <span className="wpz-num">{faNum(String(i + 1).padStart(2, "0"))}</span>
              <div className="wpz-poem-main">
                <Link href={safeHref(r.href, "/poems")} className="wpz-poem-title wpz-stretch">{r.title}</Link>
                {r.tag ? <span className="wpz-tag">{r.tag}</span> : null}
              </div>
              {r.audio ? (
                <button type="button" className="wpz-play" onClick={() => toggle(i, safeHref(r.audio, ""))} aria-label={playing === i ? "توقف" : "پخش"} aria-pressed={playing === i}>
                  {playing === i ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {r.duration ? <span className="wpz-dur">{faNum(r.duration)}</span> : null}
                </button>
              ) : r.duration ? <span className="wpz-dur">{faNum(r.duration)}</span> : null}
              <div className="wpz-menu-wrap">
                <button type="button" className="wpz-icon-btn" aria-label="گزینه‌ها" aria-expanded={menu === i} onClick={() => setMenu(menu === i ? null : i)}>
                  <MoreVertical className="h-4 w-4" />
                </button>
                {menu === i ? (
                  <div className="wpz-menu" role="menu">
                    <Link role="menuitem" href={safeHref(r.href, "/poems")}>{propStr(p, "readLabel", "خواندن شعر")}</Link>
                    {r.audio ? <a role="menuitem" href={safeHref(r.audio)} download>{propStr(p, "downloadLabel", "دانلود صوت")}</a> : null}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
      <audio ref={audioRef} onEnded={() => setPlaying(null)} preload="none" />
      {propStr(p, "moreLabel") ? <Link className="wpz-more" href={safeHref(propStr(p, "moreHref"), "/blog")}>{propStr(p, "moreLabel")} <ArrowLeft className="h-4 w-4" /></Link> : null}
    </section>
  )
}

/** 3) book banner with notify-me newsletter signup. */
export function BookBannerWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const [value, setValue] = useState("")
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle")
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const v = value.trim()
    if (!v) return
    setState("sending")
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    const isEmail = v.includes("@")
    fetch(`${base}/api/v1/public/newsletter/subscribe`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(isEmail ? { email: v, source: "book-banner" } : { phone: v, source: "book-banner" }),
    }).then((r) => setState(r.ok ? "done" : "error")).catch(() => setState("error"))
  }
  return (
    <section className={shell(p, "wpz-book", "dark")} style={sectionBg(p)} dir="rtl">
      {propStr(p, "photoMode", "photo") !== "photo" ? <div className={`akx wpz-book-img ${frameClass(p, "rounded")}`}><PhotoSlot mode={propStr(p, "photoMode")} logo={propStr(p, "logo")} alt={propStr(p, "title")} /></div> : propStr(p, "image") ? <img loading="lazy" decoding="async" {...optImg(propStr(p, "image"))} alt={propStr(p, "title")} className={`wpz-book-img ${frameClass(p, "rounded")}`} /> : null}
      <div className="wpz-book-body">
        {propStr(p, "eyebrow") ? <span className="wpz-eyebrow">{propStr(p, "eyebrow")}</span> : null}
        <h2 className="wpz-h2">{propStr(p, "title")}</h2>
        <p className="wpz-text">{propStr(p, "text")}</p>
        <form className="wpz-notify" onSubmit={submit} noValidate>
          <input dir="ltr" value={value} onChange={(e) => setValue(e.target.value)} placeholder={propStr(p, "placeholder", "ایمیل یا شماره موبایل")} aria-label={propStr(p, "placeholder", "ایمیل یا شماره موبایل")} />
          <button type="submit" className="wpz-btn wpz-btn-primary" disabled={state === "sending"}>{propStr(p, "buttonLabel", "خبرم کن")}</button>
        </form>
        <p className="wpz-note" aria-live="polite">{state === "done" ? propStr(p, "success", "ثبت شد؛ به محض انتشار خبرتان می‌کنیم.") : state === "error" ? "ثبت انجام نشد؛ دوباره تلاش کنید." : ""}</p>
      </div>
    </section>
  )
}

/** 4) occasion cards: photo background + dark crimson gradient, link per card; scroll-snap row on mobile. */
export function OccasionCardsWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const rows = parseRows(p.items, ["title", "image", "icon", "href", "subtitle"]).filter((r) => r.title)
  const { carousel, opts } = carouselOpts(p, 4)
  const ratio = RATIOS[propStr(p, "cardRatio", "4/5")] ?? "4 / 5"
  return (
    <section className={shell(p, "wpz-section", "light")} style={sectionBg(p)} dir="rtl">
      {propStr(p, "title") ? <h2 className="wpz-h2">{propStr(p, "title")}</h2> : null}
      <OccasionTrack carousel={carousel} opts={opts} label={propStr(p, "title")} ratio={ratio}>
        {rows.map((r, i) => {
          const img = r.image.replace(/["\\()]/g, "")
          return (
            <Link key={i} role="listitem" href={safeHref(r.href, "/poems")} className={`wpz-occasion ${img ? "has-img" : ""} ${frameClass(p, "rounded")}`} style={img ? { backgroundImage: `url("${img}")` } : undefined}>
              <span className="wpz-occasion-icon"><Ico name={r.icon} className="h-5 w-5" /></span>
              <span className="wpz-occasion-title">{r.title}</span>
              {r.subtitle ? <span className="wpz-occasion-sub">{r.subtitle}</span> : null}
              <span className="wpz-occasion-arrow"><ArrowLeft className="h-4 w-4" aria-hidden /></span>
            </Link>
          )
        })}
        {!rows.length ? <p className="wpz-empty">مناسبت‌ها را وارد کنید (عنوان|تصویر|آیکن|پیوند).</p> : null}
      </OccasionTrack>
    </section>
  )
}

function OccasionTrack({ carousel, opts, label, ratio, children }: { carousel: boolean; opts: CarouselOpts; label: string; ratio: string; children: React.ReactNode }) {
  const style = { ["--wpz-card-ratio" as string]: ratio } as CSSProperties
  if (!carousel) return <div className="wpz-occ-grid" role="list" style={style}>{children}</div>
  return <div style={style}><WpzCarousel opts={opts} label={label} className="wpz-occ-carousel">{children}</WpzCarousel></div>
}

const RATIOS: Record<string, string> = { "4/5": "4 / 5", "3/4": "3 / 4", "2/3": "2 / 3", "1/1": "1 / 1", "16/10": "16 / 10" }
const inDashboard = () => typeof window !== "undefined" && /^\/dashboard(\/|$)/.test(window.location.pathname)

/** 5) audio/video media cards. */
export function MediaCardsWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const rows = parseRows(p.items, ["title", "cover", "reciter", "duration", "src", "kind"]).filter((r) => r.title)
  const [open, setOpen] = useState<number | null>(null)
  return (
    <section className={shell(p, "wpz-section", "light")} style={sectionBg(p)} dir="rtl">
      {propStr(p, "title") ? <h2 className="wpz-h2">{propStr(p, "title")}</h2> : null}
      <div className="wpz-grid">
        {rows.map((r, i) => {
          const isVideo = r.kind === "video" || /\.(mp4|webm)(\?|$)/i.test(r.src)
          const src = safeHref(r.src, "")
          return (
            <article key={i} className="wpz-media">
              <div className={`wpz-media-cover ${frameClass(p, "rounded")}`}>
                {open === i && src ? (isVideo ? <video src={src} controls autoPlay playsInline /> : <audio src={src} controls autoPlay />) : (
                  <>
                    {r.cover ? <img loading="lazy" decoding="async" {...optImg(r.cover)} alt={r.title} /> : null}
                    <button type="button" className="wpz-media-play" aria-label={`پخش ${r.title}`} onClick={() => setOpen(i)} disabled={!src}>
                      <Play className="h-6 w-6" />
                    </button>
                  </>
                )}
              </div>
              <h3 className="wpz-media-title">{isVideo ? <Video className="h-4 w-4" aria-hidden /> : <Music className="h-4 w-4" aria-hidden />} {r.title}</h3>
              <p className="wpz-media-meta">{r.reciter ? <span>{r.reciter}</span> : null}{r.duration ? <span>{faNum(r.duration)}</span> : null}</p>
            </article>
          )
        })}
      </div>
    </section>
  )
}

/** 6) shop showcase: real products from the store catalog (count/category), manual rows as override. */
type ShowRow = { title: string; image: string; price: string; href: string; demo?: boolean }
export function ShopShowcaseWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const manual = parseRows(p.items, ["title", "image", "price", "href"]).filter((r) => r.title)
  const live = propStr(p, "source", "catalog") !== "manual" && !manual.length
  const count = Math.min(24, Math.max(1, propNum(p, "count", 6)))
  const category = propStr(p, "category").trim()
  const { items } = useCatalog(live, `per_page=${Math.max(count, 24)}&sort=newest${category ? `&category=${encodeURIComponent(category)}` : ""}`)
  const fromCatalog: ShowRow[] = (items ?? [])
    .filter((x) => !category || x.categorySlug === category || x.category === category)
    .slice(0, count)
    .map((x) => ({ title: x.name.replace(/\s*(\(نمونه\)|\[demo\]|«نمونه»)\s*/gi, " ").trim(), image: x.image || x.images[0] || "", price: x.price ? String(x.price) : "", href: `/product/${encodeURIComponent(x.slug)}`, demo: isDemoProduct(x.slug, x.name) }))
  const rows: ShowRow[] = manual.length ? (manual as unknown as ShowRow[]) : fromCatalog
  const loading = live && items === null
  const ratio = RATIOS[propStr(p, "imageRatio", "4/5")] ?? "4 / 5"
  const editor = inDashboard()
  const { carousel, opts } = carouselOpts(p, 4)
  if (!rows.length && !loading && !editor) return null
  return (
    <section className={shell(p, "wpz-section", "light")} style={{ ...sectionBg(p), ["--wpz-pr-ratio" as string]: ratio } as CSSProperties} dir="rtl">
      <div className="wpz-head">
        {propStr(p, "title") ? <h2 className="wpz-h2">{propStr(p, "title")}</h2> : null}
        {propStr(p, "moreLabel") ? <Link className="wpz-more" href={safeHref(propStr(p, "moreHref"), "/shop")}>{propStr(p, "moreLabel")} <ArrowLeft className="h-4 w-4" /></Link> : null}
      </div>
      <ShopTrack carousel={carousel} opts={opts} label={propStr(p, "title")}>
        {loading ? Array.from({ length: Math.min(count, 6) }, (_, i) => <div key={i} className="wpz-product wpz-skel" aria-hidden />) : null}
        {rows.map((r, i) => (
          <article key={i} className="wpz-product">
            <Link href={safeHref(r.href, "/shop")} className={`wpz-product-media ${frameClass(p, "rounded")}`}>
              {r.image ? <img {...optImg(r.image, "(max-width: 760px) 80vw, 300px")} alt={r.title} className="wpz-product-img" loading="lazy" decoding="async" /> : <span className="wpz-product-img wpz-img-empty"><ShoppingBag className="h-8 w-8" aria-hidden /></span>}
            </Link>
            <h3 className="wpz-product-title">{r.title}</h3>
            <p className="wpz-price">{formatToman(r.price) || propStr(p, "priceLabel")}</p>
            <Link className="wpz-btn wpz-btn-primary" href={safeHref(r.href, "/shop")}>{propStr(p, "buttonLabel", "مشاهده محصول")}</Link>
          </article>
        ))}
        {!rows.length && !loading && editor ? (
          <article className="wpz-product wpz-placeholder">
            <span className="wpz-product-media wpz-frame-rounded"><span className="wpz-product-img wpz-img-empty"><ShoppingBag className="h-8 w-8" aria-hidden /></span></span>
            <h3 className="wpz-product-title">قاب نمونه</h3>
            <p className="wpz-price">{propStr(p, "priceLabel", "قیمت (از مشتری)")}</p>
            <small className="wpz-empty">محصولی در فروشگاه نیست؛ پس از افزودن محصول، این‌جا خودکار نمایش داده می‌شود.</small>
          </article>
        ) : null}
      </ShopTrack>
    </section>
  )
}

function ShopTrack({ carousel, opts, label, children }: { carousel: boolean; opts: CarouselOpts; label: string; children: React.ReactNode }) {
  if (!carousel) return <div className="wpz-grid wpz-shop-grid">{children}</div>
  return <WpzCarousel opts={opts} label={label} className="wpz-shop-carousel">{children}</WpzCarousel>
}

/** 7) about the poet. */
export function PoetAboutWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  return (
    <section className={shell(p, "wpz-about", "light")} style={sectionBg(p)} dir="rtl">
      {propStr(p, "photoMode", "logo") === "photo" && propStr(p, "image") ? <img loading="lazy" decoding="async" {...optImg(propStr(p, "image"))} alt={propStr(p, "title")} className={`wpz-img ${frameClass(p)}`} /> : <div className={`akx wpz-img ${frameClass(p)}`}><PhotoSlot mode={propStr(p, "photoMode", "logo")} logo={propStr(p, "logo")} alt={propStr(p, "title")} fallback="logo" /></div>}
      <div>
        {propStr(p, "eyebrow") ? <span className="wpz-eyebrow">{propStr(p, "eyebrow")}</span> : null}
        <h2 className="wpz-h2">{propStr(p, "title")}</h2>
        {propStr(p, "text").split(/\n{2,}/).filter(Boolean).map((t, i) => <p key={i} className="wpz-text">{t}</p>)}
        <SocialRow value={p.socials} />
        {propStr(p, "linkLabel") ? <Link className="wpz-more" href={safeHref(propStr(p, "linkHref"), "/about")}>{propStr(p, "linkLabel")} <ArrowLeft className="h-4 w-4" /></Link> : null}
      </div>
    </section>
  )
}

/** 8) quote block with big quotation marks. */
export function QuoteBlockWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  return (
    <figure className={shell(p, "wpz-quote", "dark")} style={sectionBg(p)} dir="rtl">
      <Quote className="wpz-quote-mark" aria-hidden />
      <blockquote>{propStr(p, "text").split("\n").map((l, i) => <span key={i}>{l}</span>)}</blockquote>
      {propStr(p, "author") ? <figcaption>— {propStr(p, "author")}</figcaption> : null}
    </figure>
  )
}

const SOCIAL_LABELS: Record<string, string> = { instagram: "اینستاگرام", telegram: "تلگرام", bale: "بله", eitaa: "ایتا", youtube: "یوتیوب", aparat: "آپارات", x: "ایکس" }

const SOCIAL_IMG: Record<string, string> = { eitaa: "/brand/connect/eitaa.png", bale: "/brand/connect/bale.png", instagram: "/brand/connect/instagram.svg", telegram: "/brand/connect/telegram.svg", rubika: "/brand/connect/rubika.png" }

export function SocialGlyph({ network }: { network: string }) {
  if (SOCIAL_IMG[network]) return <img loading="lazy" decoding="async" {...optImg(SOCIAL_IMG[network])} alt="" className="h-5 w-5 rounded-full" />
  return <span aria-hidden>{(SOCIAL_LABELS[network] ?? network).slice(0, 1)}</span>
}

export function SocialRow({ value }: { value: unknown }) {
  const socials = parseRows(value, ["network", "href"]).filter((r) => r.href)
  if (!socials.length) return null
  return (
    <div className="wpz-socials">
      {socials.map((s, i) => (
        <a key={i} href={safeHref(s.href)} target="_blank" rel="noopener noreferrer" aria-label={SOCIAL_LABELS[s.network] ?? s.network} className="wpz-social"><SocialGlyph network={s.network} /></a>
      ))}
    </div>
  )
}

/** 9) dark crimson footer: logo, link columns, social icons. */
export function PoetryFooterWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const links = parseRows(p.links, ["label", "href"]).filter((r) => r.label)
  const socials = parseRows(p.socials, ["network", "href"]).filter((r) => r.href)
  return (
    <footer className={shell({ ...p, tone: "dark" }, "wpz-footer", "dark")} style={sectionBg(p)} dir="rtl">
      <div className="wpz-footer-brand">
        {propStr(p, "logo") ? <img loading="eager" fetchPriority="high" decoding="async" {...optImg(propStr(p, "logo"), undefined, true)} alt={propStr(p, "brand")} className="wpz-logo" /> : null}
        {propStr(p, "brand") ? <strong>{propStr(p, "brand")}</strong> : null}
        {propStr(p, "text") ? <p>{propStr(p, "text")}</p> : null}
      </div>
      <nav className="wpz-footer-links" aria-label="پیوندهای پاورقی">
        {links.map((l, i) => <Link key={i} href={safeHref(l.href)}>{l.label}</Link>)}
      </nav>
      <div className="wpz-socials">
        {socials.map((s, i) => (
          <a key={i} href={safeHref(s.href)} target="_blank" rel="noopener noreferrer" aria-label={SOCIAL_LABELS[s.network] ?? s.network} className="wpz-social">
            <SocialGlyph network={s.network} />
          </a>
        ))}
      </div>
      {propStr(p, "copyright") ? <p className="wpz-copy">{propStr(p, "copyright")}</p> : null}
    </footer>
  )
}
