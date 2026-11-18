"use client"

import dynamic from "next/dynamic"
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import {
  CalendarDays,
  Check,
  ChevronLeft,
  Clock,
  Copy,
  Globe,
  Link2,
  Mail,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Send,
  Sparkles,
  UtensilsCrossed,
  X,
} from "lucide-react"

import "../site/link-hub-public.css"
import { LinkHubCard } from "./LinkHubCard"
import { LinkHubSpotlight } from "./LinkHubSpotlight"
import { DAY_LABELS, faDigits, heroGradient, normalizeTheme, nowIn, osmDirections, toMinutes } from "./view-utils"

const MapPinPicker = dynamic(() => import("@/components/MapPinPicker").then((m) => m.MapPinPicker), {
  ssr: false,
  loading: () => <div className="lh-map-skeleton" aria-hidden />,
})

export type PublicBlock = { id: number; type: string; payload: Record<string, unknown> }

export type PublicPage = {
  profile: {
    id?: number
    title: string
    avatar_url?: string | null
    bio?: string | null
    theme_json?: Record<string, unknown> | null
    slug?: string | null
  }
  blocks: PublicBlock[]
}

export type Handlers = {
  onSubmit?: (blockId: number, form: HTMLFormElement) => void
  onClickTrack?: (blockId: number, target?: string) => void
  sending?: number | null
  done?: Record<number, boolean>
  /** Editor preview: links do not navigate and the form does not post. */
  preview?: boolean
}

/* ---------- icons ---------- */

type BrandIcon = { src: string; color: string; photo?: boolean }

const BRANDS: Array<{ keys: string[]; icon: BrandIcon }> = [
  { keys: ["instagram", "اینستاگرام", "instagram.com"], icon: { src: "/brand/connect/instagram.svg", color: "#E4405F" } },
  { keys: ["telegram", "تلگرام", "t.me"], icon: { src: "/brand/connect/telegram.svg", color: "#26A5E4" } },
  { keys: ["whatsapp", "واتساپ", "wa.me"], icon: { src: "/brand/connect/whatsapp.svg", color: "#25D366" } },
  { keys: ["linkedin", "لینکدین"], icon: { src: "/brand/connect/linkedin.svg", color: "#0A66C2" } },
  { keys: ["bale", "بله", "ble.ir"], icon: { src: "/brand/connect/bale.png", color: "#00A651", photo: true } },
  { keys: ["eitaa", "ایتا"], icon: { src: "/brand/connect/eitaa.png", color: "#FF7534", photo: true } },
  { keys: ["rubika", "روبیکا"], icon: { src: "/brand/connect/rubika.png", color: "#7B2D8E", photo: true } },
  { keys: ["igap", "آیگپ"], icon: { src: "/brand/connect/igap.png", color: "#00BFA5", photo: true } },
  { keys: ["gap.im", "گپ"], icon: { src: "/brand/connect/gap.png", color: "#1E88E5", photo: true } },
]

function brandFor(label: string, url: string, network?: string): BrandIcon | null {
  const hay = `${network ?? ""} ${label} ${url}`.toLowerCase()
  for (const row of BRANDS) {
    if (row.keys.some((k) => hay.includes(k.toLowerCase()))) return row.icon
  }
  return null
}

function GenericIcon({ name }: { name: string }) {
  const props = { size: 20, strokeWidth: 2, "aria-hidden": true } as const
  switch (name) {
    case "phone":
      return <Phone {...props} />
    case "mail":
    case "email":
      return <Mail {...props} />
    case "web":
    case "globe":
      return <Globe {...props} />
    case "map":
      return <MapPin {...props} />
    case "hours":
    case "clock":
      return <Clock {...props} />
    case "menu":
      return <UtensilsCrossed {...props} />
    case "calendar":
    case "event":
      return <CalendarDays {...props} />
    case "message":
      return <MessageCircle {...props} />
    case "send":
      return <Send {...props} />
    case "sparkles":
      return <Sparkles {...props} />
    default:
      return <Link2 {...props} />
  }
}

function iconNameForUrl(url: string, fallback = "link"): string {
  if (url.startsWith("tel:")) return "phone"
  if (url.startsWith("mailto:")) return "mail"
  if (/maps|openstreetmap|neshan|balad/i.test(url)) return "map"
  return fallback
}

function ChannelIcon({ label, url, network, name }: { label: string; url: string; network?: string; name?: string }) {
  const brand = brandFor(label, url, network)
  if (brand) {
    return (
      <span
        className={`lh-ico is-brand${brand.photo ? " is-photo" : ""}`}
        style={{ ["--lh-brand" as string]: brand.color } as CSSProperties}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.src} alt="" />
      </span>
    )
  }
  return (
    <span className="lh-ico">
      <GenericIcon name={name ?? iconNameForUrl(url)} />
    </span>
  )
}

/* ---------- copy ---------- */

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className={`lh-copy${copied ? " is-done" : ""}`}
      aria-label={`کپی ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1600)
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
      <span>{copied ? "کپی شد" : "کپی"}</span>
      <span className="lh-sr" aria-live="polite">
        {copied ? "کپی شد" : ""}
      </span>
    </button>
  )
}

/* ---------- rows ---------- */

type Row = { key: string; label: string; value: string; href: string; copy: string; network?: string; icon?: string; highlight?: boolean }

function ContactRow({ row, onTrack, preview }: { row: Row; onTrack: (t?: string) => void; preview?: boolean }) {
  const external = /^https?:/i.test(row.href)
  return (
    <div className={`lh-row${row.highlight ? " is-highlight" : ""}`}>
      <a
        className="lh-row-link"
        href={preview ? undefined : row.href}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer noopener" : undefined}
        onClick={() => onTrack(row.href)}
      >
        <ChannelIcon label={row.label} url={row.href} network={row.network} name={row.icon} />
        <span className="lh-row-meta">
          <span className="lh-row-label">{row.label}</span>
          <span className="lh-row-value" dir="ltr">
            {row.value}
          </span>
        </span>
        <ChevronLeft className="lh-row-chev" size={18} aria-hidden />
      </a>
      <CopyButton value={row.copy} label={row.label} />
    </div>
  )
}

function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")
}

function contactRows(p: Record<string, unknown>): Row[] {
  const rows: Row[] = []
  if (p.phone) {
    const v = String(p.phone)
    rows.push({ key: "phone", label: "تلفن", value: faDigits(v), href: `tel:${v.replace(/[^\d+]/g, "")}`, copy: v, icon: "phone", highlight: true })
  }
  const phones = Array.isArray(p.phones) ? (p.phones as Array<Record<string, unknown>>) : []
  phones.forEach((ph, i) => {
    const v = String(ph.value ?? "")
    if (!v) return
    const digits = v.replace(/[^\d+]/g, "")
    rows.push({
      key: `ph${i}`,
      label: String(ph.label || "تلفن"),
      value: faDigits(v),
      href: ph.whatsapp ? `https://wa.me/${digits.replace(/^\+/, "").replace(/^0/, "98")}` : `tel:${digits}`,
      copy: v,
      network: ph.whatsapp ? "whatsapp" : undefined,
      icon: "phone",
    })
  })
  if (p.email) {
    const v = String(p.email)
    rows.push({ key: "email", label: "ایمیل", value: v, href: `mailto:${v}`, copy: v, icon: "mail" })
  }
  const socials = Array.isArray(p.socials) ? (p.socials as Array<Record<string, unknown>>) : []
  socials.forEach((s, i) => {
    const url = String(s.url || "")
    if (!url || url === "#") return
    const value = String(s.value || shortUrl(url))
    rows.push({
      key: `s${i}`,
      label: String(s.label || shortUrl(url)),
      value: faDigits(value),
      href: url,
      copy: s.value ? String(s.value) : url,
      network: s.network ? String(s.network) : undefined,
      icon: iconNameForUrl(url, "web"),
    })
  })
  return rows
}

/* ---------- blocks ---------- */

function HoursBlock({ p }: { p: Record<string, unknown> }) {
  const days = Array.isArray(p.days) ? (p.days as Array<Record<string, unknown>>) : []
  const tz = String(p.timezone || "Asia/Tehran")
  const [now, setNow] = useState<{ day: string; minutes: number } | null>(null)
  useEffect(() => {
    setNow(nowIn(tz))
    const id = window.setInterval(() => setNow(nowIn(tz)), 60_000)
    return () => window.clearInterval(id)
  }, [tz])

  const today = now ? days.find((d) => d.day === now.day) : undefined
  let status: { open: boolean; text: string } | null = null
  if (today && now && today.known) {
    const o = toMinutes(today.open as string)
    const c = toMinutes(today.close as string)
    if (today.closed || o === null || c === null) status = { open: false, text: "امروز تعطیل است" }
    else {
      const open = c > o ? now.minutes >= o && now.minutes < c : now.minutes >= o || now.minutes < c
      status = open
        ? { open: true, text: `باز است تا ${faDigits(String(today.close))}` }
        : { open: false, text: `بسته است، ساعت کاری ${faDigits(String(today.open))} تا ${faDigits(String(today.close))}` }
    }
  }

  return (
    <section className="lh-card lh-hours" aria-labelledby={`hours-${String(p.title)}`}>
      <header className="lh-card-head">
        <span className="lh-ico">
          <Clock size={20} aria-hidden />
        </span>
        <h2 id={`hours-${String(p.title)}`}>{String(p.title || "ساعت کاری")}</h2>
        {status ? <span className={`lh-status${status.open ? " is-open" : ""}`}>{status.text}</span> : null}
      </header>
      <ul className="lh-hours-list">
        {days.map((d) => {
          const isToday = now?.day === d.day
          const value = !d.known ? "ندارد" : d.closed ? "تعطیل" : `${faDigits(String(d.open))} تا ${faDigits(String(d.close))}`
          return (
            <li key={String(d.day)} className={isToday ? "is-today" : undefined} aria-current={isToday ? "date" : undefined}>
              <span>{DAY_LABELS[String(d.day)] ?? String(d.day)}</span>
              <span className={!d.known || d.closed ? "is-muted" : undefined}>{value}</span>
            </li>
          )
        })}
      </ul>
      {p.note ? <p className="lh-note">{String(p.note)}</p> : null}
    </section>
  )
}

function MapBlock({ p, preview }: { p: Record<string, unknown>; preview?: boolean }) {
  const lat = Number(p.lat)
  const lng = Number(p.lng)
  const zoom = Number(p.zoom) || 16
  const directions = p.directions_url ? String(p.directions_url) : osmDirections(lat, lng, zoom)
  return (
    <section className="lh-card lh-map">
      <header className="lh-card-head">
        <span className="lh-ico">
          <MapPin size={20} aria-hidden />
        </span>
        <h2>{String(p.title || "موقعیت روی نقشه")}</h2>
      </header>
      {p.address ? <p className="lh-address">{faDigits(String(p.address))}</p> : null}
      <div className="lh-map-frame">
        <MapPinPicker value={{ lat, lng }} readOnly height={240} />
      </div>
      <div className="lh-map-actions">
        <a className="lh-btn" href={preview ? undefined : directions} target="_blank" rel="noreferrer noopener">
          <Navigation size={16} aria-hidden />
          مسیریابی
        </a>
        {p.address ? <CopyButton value={String(p.address)} label="نشانی" /> : null}
      </div>
    </section>
  )
}

function GalleryBlock({ p }: { p: Record<string, unknown> }) {
  const images = Array.isArray(p.images) ? (p.images as Array<{ url: string; alt?: string; caption?: string }>) : []
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null)
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i + 1) % images.length))
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i - 1 + images.length) % images.length))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, images.length])
  const current = open !== null ? images[open] : null
  return (
    <section className="lh-gallery-wrap">
      {p.title ? <h2 className="lh-section-title">{String(p.title)}</h2> : null}
      <div className={`lh-gallery is-${p.layout === "carousel" ? "carousel" : "grid"}`}>
        {images.map((img, i) => (
          <button key={img.url + i} type="button" className="lh-gallery-item" onClick={() => setOpen(i)} aria-label={img.alt || `تصویر ${faDigits(i + 1)}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={img.alt || ""} loading="lazy" decoding="async" />
          </button>
        ))}
      </div>
      {current ? (
        <div className="lh-lightbox" role="dialog" aria-modal="true" aria-label={current.alt || "تصویر"} onClick={() => setOpen(null)}>
          <button type="button" className="lh-lightbox-close" aria-label="بستن" onClick={() => setOpen(null)}>
            <X size={22} aria-hidden />
          </button>
          <figure onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.url} alt={current.alt || ""} />
            {current.caption ? <figcaption>{current.caption}</figcaption> : null}
          </figure>
        </div>
      ) : null}
    </section>
  )
}

function ImageBlock({ p, preview }: { p: Record<string, unknown>; preview?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  const img = <img src={String(p.url)} alt={String(p.alt || "")} loading="lazy" decoding="async" />
  return (
    <figure className="lh-image">
      {p.href && !preview ? (
        <a href={String(p.href)} target="_blank" rel="noreferrer noopener">
          {img}
        </a>
      ) : (
        img
      )}
      {p.caption ? <figcaption>{String(p.caption)}</figcaption> : null}
    </figure>
  )
}

function FormBlock({ block, h }: { block: PublicBlock; h: Handlers }) {
  const p = block.payload
  const fields = Array.isArray(p.fields) ? p.fields : []
  const sending = h.sending === block.id
  const done = Boolean(h.done?.[block.id])
  return (
    <form
      className="lh-card lh-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (h.preview) return
        h.onSubmit?.(block.id, e.currentTarget)
      }}
    >
      <header className="lh-card-head">
        <span className="lh-ico">
          <MessageCircle size={20} aria-hidden />
        </span>
        <h2>{String(p.title || "فرم")}</h2>
      </header>
      {p.description ? <p className="lh-note">{String(p.description)}</p> : null}
      {done ? (
        <p className="lh-success" role="status">
          <Check size={18} aria-hidden /> {String(p.success_message || "پیام شما ثبت شد.")}
        </p>
      ) : (
        <>
          {fields.map((field, i) => {
            const f = field as { name?: string; label?: string; type?: string; required?: boolean }
            const name = f.name || `field_${i}`
            const id = `lh-f-${block.id}-${name}`
            const common = { id, name, required: Boolean(f.required), placeholder: f.label || name }
            return (
              <label key={name} className="lh-field" htmlFor={id}>
                <span>
                  {f.label || name}
                  {f.required ? <span aria-hidden> *</span> : null}
                </span>
                {f.type === "textarea" ? (
                  <textarea {...common} rows={3} />
                ) : (
                  <input {...common} type={["text", "tel", "email", "number"].includes(f.type || "") ? f.type : "text"} dir={f.type === "tel" || f.type === "email" ? "ltr" : undefined} />
                )}
              </label>
            )
          })}
          <button type="submit" className="lh-btn is-primary" disabled={sending}>
            {sending ? "در حال ارسال…" : String(p.submit_label || "ارسال")}
          </button>
        </>
      )}
    </form>
  )
}

function CtaCard({ block, h }: { block: PublicBlock; h: Handlers }) {
  const p = block.payload
  const url = String(p.url)
  const variant = String(p.variant || "primary")
  const external = /^https?:/i.test(url)
  const label = String(p.label)
  return (
    <a
      className={`lh-cta is-${variant}`}
      href={h.preview ? undefined : url}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer noopener" : undefined}
      onClick={() => h.onClickTrack?.(block.id, url)}
    >
      <ChannelIcon label={label} url={url} name={String(p.icon || iconNameForUrl(url))} />
      <span className="lh-cta-meta">
        <span className="lh-cta-label">{label}</span>
        {p.sublabel ? (
          <span className="lh-cta-sub" dir="auto">
            {faDigits(String(p.sublabel))}
          </span>
        ) : null}
      </span>
    </a>
  )
}

export function BlockView({ block, h }: { block: PublicBlock; h: Handlers }) {
  const p = block.payload
  const track = (t?: string) => h.onClickTrack?.(block.id, t)

  switch (block.type) {
    case "section":
      return (
        <div className="lh-section">
          <h2 className="lh-section-title">{String(p.title)}</h2>
          {p.subtitle ? <p className="lh-note">{String(p.subtitle)}</p> : null}
        </div>
      )
    case "link": {
      const url = String(p.url || "#")
      return (
        <ContactRow
          row={{ key: "l", label: String(p.label || "لینک"), value: shortUrl(url), href: url, copy: url, icon: String(p.icon || iconNameForUrl(url)) }}
          onTrack={track}
          preview={h.preview}
        />
      )
    }
    case "contact": {
      const rows = contactRows(p)
      return (
        <>
          {p.title ? <h2 className="lh-section-title">{String(p.title)}</h2> : null}
          <div className="lh-rows">
            {rows.map((row) => (
              <ContactRow key={row.key} row={row} onTrack={track} preview={h.preview} />
            ))}
          </div>
        </>
      )
    }
    case "cta":
      return <CtaCard block={block} h={h} />
    case "image":
      return <ImageBlock p={p} preview={h.preview} />
    case "gallery":
      return <GalleryBlock p={p} />
    case "map":
      return <MapBlock p={p} preview={h.preview} />
    case "hours":
      return <HoursBlock p={p} />
    case "faq": {
      const items = Array.isArray(p.items) ? p.items : []
      return (
        <section className="lh-card lh-faq">
          <h2>{String(p.title || "سوالات متداول")}</h2>
          {items.map((item, i) => {
            const row = item as { q?: string; a?: string }
            return (
              <details key={i}>
                <summary>{row.q}</summary>
                <p>{row.a}</p>
              </details>
            )
          })}
        </section>
      )
    }
    case "event": {
      const url = p.cta_url ? String(p.cta_url) : ""
      return (
        <section className="lh-card lh-event">
          <div className="lh-kicker">
            <CalendarDays size={14} aria-hidden /> رویداد
          </div>
          <h3>{String(p.title || "")}</h3>
          {p.datetime ? <p className="lh-note">{faDigits(String(p.datetime))}</p> : null}
          {url ? (
            <a className="lh-btn is-primary" href={h.preview ? undefined : url} target="_blank" rel="noreferrer noopener" onClick={() => track(url)}>
              {String(p.cta_label || "جزئیات")}
            </a>
          ) : null}
        </section>
      )
    }
    case "form":
      return <FormBlock block={block} h={h} />
    default:
      return null
  }
}

/* ---------- page ---------- */

function Headline({ text, accent }: { text: string; accent?: string }) {
  if (!accent || !text.includes(accent)) {
    return (
      <>
        {text}
        {accent ? <span className="lh-accent-word"> {accent}</span> : null}
      </>
    )
  }
  const i = text.lastIndexOf(accent)
  return (
    <>
      {text.slice(0, i)}
      <span className="lh-accent-word">{accent}</span>
      {text.slice(i + accent.length)}
    </>
  )
}

export function LinkHubView({ page, handlers = {}, footer }: { page: PublicPage; handlers?: Handlers; footer?: ReactNode }) {
  const theme = useMemo(() => normalizeTheme(page.profile.theme_json), [page.profile.theme_json])
  if ((page.profile.theme_json as { layout?: string } | null)?.layout === "spotlight") {
    return <LinkHubSpotlight page={page} handlers={handlers} footer={footer} />
  }
  if ((page.profile.theme_json as { layout?: string } | null)?.layout === "card") {
    return <LinkHubCard page={page} handlers={handlers} footer={footer} />
  }
  const ctas = page.blocks.filter((b) => b.type === "cta")
  const primaryCtas = ctas.filter((b) => b.payload.variant !== "chip")
  const chips = ctas.filter((b) => b.payload.variant === "chip")
  const body = page.blocks.filter((b) => b.type !== "cta")
  const title = page.profile.title || ""
  const headline = theme.headline || title

  const style = {
    ["--lh-accent" as string]: theme.accent,
    ["--lh-bg" as string]: theme.background,
    ["--lh-radius" as string]: `${theme.radius}px`,
    ["--lh-hero" as string]: heroGradient(theme.hero_gradient, theme.accent),
  } as CSSProperties

  return (
    <div className="lh-root">
      <div
        className="lh-page"
        style={style}
        dir="rtl"
        data-mode={theme.mode}
        data-font={theme.font}
        data-card={theme.card_style}
        data-gradient={theme.hero_gradient}
      >
        <div className="lh-atmos" aria-hidden />
        <div className="lh-shell">
          <aside className="lh-aside">
            <header className="lh-hero">
              <div className="lh-avatar-ring">
                {page.profile.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={page.profile.avatar_url} alt={title} className="lh-avatar" width={96} height={96} />
                ) : (
                  <div className="lh-avatar lh-avatar-fallback" aria-hidden>
                    {title.slice(0, 1) || "?"}
                  </div>
                )}
              </div>
              {theme.kicker ? <p className="lh-kicker">{theme.kicker}</p> : null}
              <h1 className="lh-title">
                <Headline text={headline} accent={theme.headline_accent} />
              </h1>
              {theme.headline && title && theme.headline !== title ? <p className="lh-subtitle">{title}</p> : null}
              {page.profile.bio ? <p className="lh-bio">{faDigits(page.profile.bio)}</p> : null}
            </header>
            {primaryCtas.length ? (
              <nav className="lh-ctas" aria-label="راه‌های تماس سریع">
                {primaryCtas.map((b) => (
                  <CtaCard key={b.id} block={b} h={handlers} />
                ))}
              </nav>
            ) : null}
            {chips.length ? (
              <div className="lh-chips">
                {chips.map((b) => (
                  <CtaCard key={b.id} block={b} h={handlers} />
                ))}
              </div>
            ) : null}
          </aside>

          <main className="lh-main">
            {body.map((block) => (
              <BlockView key={block.id} block={block} h={handlers} />
            ))}
            {theme.footer_note ? <p className="lh-footer-note">{theme.footer_note}</p> : null}
            {footer}
          </main>
        </div>
      </div>
    </div>
  )
}
