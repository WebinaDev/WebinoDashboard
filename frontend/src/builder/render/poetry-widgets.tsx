"use client"

/* Poetry / Muharram blog widgets (crimson + cream, arch frames, Islamic pattern background).
 * Theme tokens live in poetry-widgets.css (--wpz-*); every widget accepts `tone` (light|dark),
 * `frame` (arch|rounded|square) and `pattern` (bool) where relevant. Repeaters use the shared
 * `a|b|c` per-line format so they edit with the same RepeaterInput as other widgets. */

import { ArrowLeft, BookOpen, Flame, Moon, MoreVertical, Music, Pause, Play, Quote, Star, Video } from "lucide-react"
import Link from "next/link"
import { useRef, useState } from "react"

import { parseRows, propBool, propStr } from "../props"
import type { WidgetNode } from "../types"
import { PhotoSlot } from "./poetry-pages-widgets"
import "./poetry-widgets.css"

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
  const tone = propStr(p, "tone", defTone) === "dark" ? "wpz-dark" : "wpz-light"
  return `wpz ${tone} ${propBool(p, "pattern", false) ? "wpz-pattern" : ""} ${extra}`
}

const ICONS: Record<string, typeof Flame> = { flame: Flame, moon: Moon, star: Star, book: BookOpen, music: Music, video: Video }
const Ico = ({ name, className }: { name: string; className?: string }) => {
  const I = ICONS[name] ?? Star
  return <I className={className} aria-hidden />
}

/** 1) hero: side image, eyebrow, big title, two CTAs, vertical couplet. */
export function PoetryHeroWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const img = propStr(p, "image")
  const couplet = propStr(p, "couplet").split("\n").map((s) => s.trim()).filter(Boolean)
  return (
    <section className={shell(p, "wpz-hero", "light")} dir="rtl">
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
        {img && propStr(p, "photoMode", "photo") === "photo" ? <img src={img} alt={propStr(p, "imageAlt")} className={`wpz-img ${frameClass(p)}`} /> : <div className={`akx wpz-img ${frameClass(p)}`}><PhotoSlot mode={propStr(p, "photoMode", "photo")} logo={propStr(p, "logo")} alt={propStr(p, "imageAlt")} /></div>}
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
export function PoemListWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const rows = parseRows(p.items, ["title", "tag", "audio", "duration", "href"]).filter((r) => r.title)
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
    <section className={shell(p, "wpz-section", "light")} dir="rtl">
      {propStr(p, "title") ? <h2 className="wpz-h2">{propStr(p, "title")}</h2> : null}
      {!rows.length ? <p className="wpz-empty">اشعار را وارد کنید (عنوان|مناسبت|فایل صوتی|مدت|پیوند).</p> : (
        <ol className="wpz-poems">
          {rows.map((r, i) => (
            <li key={i} className="wpz-poem">
              <span className="wpz-num">{faNum(String(i + 1).padStart(2, "0"))}</span>
              <div className="wpz-poem-main">
                <Link href={safeHref(r.href)} className="wpz-poem-title">{r.title}</Link>
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
                    <Link role="menuitem" href={safeHref(r.href)}>{propStr(p, "readLabel", "خواندن شعر")}</Link>
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
    <section className={shell(p, "wpz-book", "dark")} dir="rtl">
      {propStr(p, "photoMode", "photo") !== "photo" ? <div className={`akx wpz-book-img ${frameClass(p, "rounded")}`}><PhotoSlot mode={propStr(p, "photoMode")} logo={propStr(p, "logo")} alt={propStr(p, "title")} /></div> : propStr(p, "image") ? <img src={propStr(p, "image")} alt={propStr(p, "title")} className={`wpz-book-img ${frameClass(p, "rounded")}`} /> : null}
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

/** 4) horizontally scrollable occasion cards. */
export function OccasionCardsWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const rows = parseRows(p.items, ["title", "image", "icon", "href"]).filter((r) => r.title)
  return (
    <section className={shell(p, "wpz-section", "light")} dir="rtl">
      {propStr(p, "title") ? <h2 className="wpz-h2">{propStr(p, "title")}</h2> : null}
      <div className="wpz-hscroll" role="list">
        {rows.map((r, i) => (
          <Link key={i} role="listitem" href={safeHref(r.href)} className={`wpz-occasion ${frameClass(p)}`} style={r.image ? { backgroundImage: `url("${r.image.replace(/"/g, "")}")` } : undefined}>
            <span className="wpz-occasion-icon"><Ico name={r.icon} className="h-5 w-5" /></span>
            <span className="wpz-occasion-title">{r.title}</span>
            <ArrowLeft className="wpz-occasion-arrow h-4 w-4" aria-hidden />
          </Link>
        ))}
        {!rows.length ? <p className="wpz-empty">مناسبت‌ها را وارد کنید (عنوان|تصویر|آیکن|پیوند).</p> : null}
      </div>
    </section>
  )
}

/** 5) audio/video media cards. */
export function MediaCardsWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const rows = parseRows(p.items, ["title", "cover", "reciter", "duration", "src", "kind"]).filter((r) => r.title)
  const [open, setOpen] = useState<number | null>(null)
  return (
    <section className={shell(p, "wpz-section", "light")} dir="rtl">
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
                    {r.cover ? <img src={r.cover} alt={r.title} /> : null}
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

/** 6) shop showcase product cards (price in toman). */
export function ShopShowcaseWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const rows = parseRows(p.items, ["title", "image", "price", "href"]).filter((r) => r.title)
  return (
    <section className={shell(p, "wpz-section", "light")} dir="rtl">
      {propStr(p, "title") ? <h2 className="wpz-h2">{propStr(p, "title")}</h2> : null}
      <div className="wpz-grid">
        {rows.map((r, i) => (
          <article key={i} className="wpz-product">
            {r.image ? <img src={r.image} alt={r.title} className={`wpz-product-img ${frameClass(p)}`} /> : <div className={`wpz-product-img wpz-img-empty ${frameClass(p)}`} />}
            <h3 className="wpz-product-title">{r.title}</h3>
            <p className="wpz-price">{formatToman(r.price) || propStr(p, "priceLabel")}</p>
            <Link className="wpz-btn wpz-btn-primary" href={safeHref(r.href, "/shop")}>{propStr(p, "buttonLabel", "خرید")}</Link>
          </article>
        ))}
      </div>
    </section>
  )
}

/** 7) about the poet. */
export function PoetAboutWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  return (
    <section className={shell(p, "wpz-about", "light")} dir="rtl">
      {propStr(p, "photoMode", "logo") === "photo" && propStr(p, "image") ? <img src={propStr(p, "image")} alt={propStr(p, "title")} className={`wpz-img ${frameClass(p)}`} /> : <div className={`akx wpz-img ${frameClass(p)}`}><PhotoSlot mode={propStr(p, "photoMode", "logo")} logo={propStr(p, "logo")} alt={propStr(p, "title")} fallback="logo" /></div>}
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
    <figure className={shell(p, "wpz-quote", "dark")} dir="rtl">
      <Quote className="wpz-quote-mark" aria-hidden />
      <blockquote>{propStr(p, "text").split("\n").map((l, i) => <span key={i}>{l}</span>)}</blockquote>
      {propStr(p, "author") ? <figcaption>— {propStr(p, "author")}</figcaption> : null}
    </figure>
  )
}

const SOCIAL_LABELS: Record<string, string> = { instagram: "اینستاگرام", telegram: "تلگرام", bale: "بله", eitaa: "ایتا", youtube: "یوتیوب", aparat: "آپارات", x: "ایکس" }

const SOCIAL_IMG: Record<string, string> = { eitaa: "/brand/connect/eitaa.png", bale: "/brand/connect/bale.png", instagram: "/brand/connect/instagram.svg", telegram: "/brand/connect/telegram.svg", rubika: "/brand/connect/rubika.png" }

export function SocialGlyph({ network }: { network: string }) {
  if (SOCIAL_IMG[network]) return <img src={SOCIAL_IMG[network]} alt="" className="h-5 w-5 rounded-full" />
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
    <footer className={shell({ ...p, tone: "dark" }, "wpz-footer", "dark")} dir="rtl">
      <div className="wpz-footer-brand">
        {propStr(p, "logo") ? <img src={propStr(p, "logo")} alt={propStr(p, "brand")} className="wpz-logo" /> : null}
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
