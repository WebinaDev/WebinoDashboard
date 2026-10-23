"use client"

/* Renderers for the @webina/ui v0.2 gap widgets (schemas live in the shared package; renderers stay per platform). */

import Link from "next/link"
import { useEffect, useRef, useState, type CSSProperties } from "react"

import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

import { parseLinks, parseRows, propBool, propNum, propStr } from "../props"
import type { WidgetNode } from "../types"
import { embedVideoSrc } from "./sanitize-html"
import { optImg } from "@/lib/image-url"

function safeHref(href: string, fallback = "#"): string {
  const h = href.trim()
  if (!h) return fallback
  if (h.startsWith("/") || h.startsWith("#") || /^https?:\/\//i.test(h) || /^(mailto|tel):/i.test(h)) return h
  return fallback
}

function safeMedia(src: string): string {
  const s = src.trim()
  return s.startsWith("/") || /^https?:\/\//i.test(s) ? s : ""
}

const alignClass = (a: string) => (a === "start" ? "text-start" : a === "end" ? "text-end" : "text-center")

export function TeamGridWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const members = parseRows(p.members, ["name", "role", "photo", "quote", "link"]).filter((m) => m.name)
  const cols = Math.min(4, Math.max(1, Number(propStr(p, "columns", "3")) || 3))
  const layout = propStr(p, "layout", "grid")
  const title = propStr(p, "title")
  return (
    <section className={alignClass(propStr(p, "align", "center"))}>
      {title ? <h2 className="wb-type-h2 mb-4 font-bold">{title}</h2> : null}
      <div
        className={layout === "slider" ? "flex snap-x gap-4 overflow-x-auto pb-2" : "grid gap-4"}
        style={layout === "slider" ? undefined : { gridTemplateColumns: `repeat(${layout === "cards" ? Math.min(cols, 2) : cols}, minmax(0, 1fr))` }}
      >
        {members.map((m, i) => {
          const photo = safeMedia(m.photo)
          const body = (
            <div className={`sf-card h-full p-4 ${layout === "cards" ? "flex items-center gap-4 text-start" : ""} ${layout === "slider" ? "w-60 shrink-0 snap-start" : ""}`}>
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt={m.name} loading="lazy" className={`${layout === "cards" ? "size-20" : "mx-auto size-24"} rounded-full object-cover`} />
              ) : null}
              <div className="mt-2">
                <div className="font-bold">{m.name}</div>
                {m.role ? <div className="text-sm text-muted-foreground">{m.role}</div> : null}
                {m.quote ? <p className="mt-2 text-sm">{m.quote}</p> : null}
              </div>
            </div>
          )
          return m.link ? <a key={i} href={safeHref(m.link)}>{body}</a> : <div key={i}>{body}</div>
        })}
      </div>
    </section>
  )
}

export function VideoEmbedWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const src = embedVideoSrc(propStr(p, "url"))
  const aspect = propStr(p, "aspect", "16/9")
  if (!src) return <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">نشانی ویدیو (یوتیوب یا آپارات) را وارد کنید</div>
  const q = new URLSearchParams()
  if (propBool(p, "autoplay")) q.set("autoplay", "1")
  if (propBool(p, "muted", true)) q.set("mute", "1")
  if (propBool(p, "loop")) q.set("loop", "1")
  if (!propBool(p, "controls", true)) q.set("controls", "0")
  const url = q.toString() ? `${src}${src.includes("?") ? "&" : "?"}${q}` : src
  return (
    <div className="overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: aspect }}>
      <iframe src={url} title={propStr(p, "title", "ویدیو")} className="h-full w-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
    </div>
  )
}

export function AudioBlockWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const src = safeMedia(propStr(p, "src"))
  return (
    <figure className="sf-card p-4">
      {propStr(p, "title") ? <figcaption className="mb-2 font-bold">{propStr(p, "title")}</figcaption> : null}
      {src ? <audio src={src} controls autoPlay={propBool(p, "autoplay")} loop={propBool(p, "loop")} className="w-full" preload="none" /> : <p className="text-sm text-muted-foreground">فایل صوت تنظیم نشده</p>}
      {propStr(p, "caption") ? <p className="mt-2 text-sm text-muted-foreground">{propStr(p, "caption")}</p> : null}
    </figure>
  )
}

export function BeforeAfterWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const [pos, setPos] = useState(() => Math.min(100, Math.max(0, propNum(p, "start", 50))))
  const vertical = propStr(p, "orientation", "horizontal") === "vertical"
  const before = safeMedia(propStr(p, "before"))
  const after = safeMedia(propStr(p, "after"))
  if (!before || !after) return <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">دو تصویر قبل و بعد را انتخاب کنید</div>
  const clip = vertical ? `inset(0 0 ${100 - pos}% 0)` : `inset(0 ${100 - pos}% 0 0)`
  return (
    <div className="relative select-none overflow-hidden rounded-2xl" dir="ltr">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img loading="lazy" decoding="async" {...optImg(after)} alt={propStr(p, "afterLabel", "بعد")} className="block w-full" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img loading="lazy" decoding="async" {...optImg(before)} alt={propStr(p, "beforeLabel", "قبل")} className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: clip }} />
      <span className="absolute start-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">{propStr(p, "beforeLabel", "قبل")}</span>
      <span className="absolute end-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">{propStr(p, "afterLabel", "بعد")}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        aria-label="قبل / بعد"
        onChange={(e) => setPos(Number(e.target.value))}
        className="absolute inset-x-0 bottom-2 mx-auto w-2/3"
      />
    </div>
  )
}

/** Lottie via the optional `lottie-web` package when present; otherwise a sized placeholder (no CDN script injection). */
export function LottieWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const ref = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const src = safeMedia(propStr(p, "src"))
  useEffect(() => {
    if (!src || !ref.current) return
    let anim: { destroy: () => void; setSpeed: (n: number) => void } | null = null
    let alive = true
    const mod = "lottie-web"
    import(/* webpackIgnore: true */ mod)
      .then((m: { default: { loadAnimation: (o: unknown) => typeof anim } }) => {
        if (!alive || !ref.current) return
        anim = m.default.loadAnimation({ container: ref.current, renderer: "svg", loop: propBool(p, "loop", true), autoplay: propBool(p, "autoplay", true), path: src })
        anim?.setSpeed(propNum(p, "speed", 1) || 1)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
      anim?.destroy()
    }
  }, [src, p])
  return (
    <div ref={ref} role="img" aria-label={propStr(p, "ariaLabel", "انیمیشن")} style={{ height: propNum(p, "height", 200) }} className={failed || !src ? "grid place-items-center rounded-xl border border-dashed text-xs text-muted-foreground" : ""}>
      {failed || !src ? "انیمیشن Lottie" : null}
    </div>
  )
}

export function LoginFormWidget({ widget, editing }: { widget: WidgetNode; editing?: boolean }) {
  const p = widget.props
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (editing) return
    setBusy(true)
    setError(null)
    try {
      await api("/api/v1/auth/login", { method: "POST", json: { email, password } })
      window.location.assign(safeHref(propStr(p, "redirect", "/account"), "/account"))
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="sf-card mx-auto grid max-w-md gap-3 p-5">
      {propStr(p, "title") ? <h2 className="text-xl font-bold">{propStr(p, "title")}</h2> : null}
      {propStr(p, "intro") ? <p className="text-sm text-muted-foreground">{propStr(p, "intro")}</p> : null}
      <input className="sf-field h-11 px-3" type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ایمیل" aria-label="ایمیل" autoComplete="email" />
      <input className="sf-field h-11 px-3" type="password" dir="ltr" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="رمز عبور" aria-label="رمز عبور" autoComplete="current-password" />
      {propBool(p, "showRemember", true) ? (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked /> مرا به خاطر بسپار</label>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <button type="submit" disabled={busy} className="rounded-full bg-primary py-2.5 font-bold text-primary-foreground disabled:opacity-50">{propStr(p, "submit", "ورود")}</button>
      <div className="flex justify-between text-sm">
        {propStr(p, "forgotLabel") ? <Link href={safeHref(propStr(p, "forgotHref", "/forgot-password"))}>{propStr(p, "forgotLabel")}</Link> : <span />}
        {propStr(p, "registerLabel") ? <Link href={safeHref(propStr(p, "registerHref", "/register"))}>{propStr(p, "registerLabel")}</Link> : null}
      </div>
    </form>
  )
}

/** Dashboard storefront sign-up is OTP-based: the form collects name/phone and hands off to /login (OTP). */
export function RegisterFormWidget({ widget, editing }: { widget: WidgetNode; editing?: boolean }) {
  const p = widget.props
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [agree, setAgree] = useState(false)
  const needTerms = propBool(p, "terms", true)
  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (editing || (needTerms && !agree)) return
    const q = new URLSearchParams({ mode: "register", next: safeHref(propStr(p, "redirect", "/account"), "/account") })
    if (phone) q.set("phone", phone)
    if (name) q.set("name", name)
    window.location.assign(`/login?${q}`)
  }
  return (
    <form onSubmit={submit} className="sf-card mx-auto grid max-w-md gap-3 p-5">
      {propStr(p, "title") ? <h2 className="text-xl font-bold">{propStr(p, "title")}</h2> : null}
      {propStr(p, "intro") ? <p className="text-sm text-muted-foreground">{propStr(p, "intro")}</p> : null}
      {propBool(p, "showName", true) ? <input className="sf-field h-11 px-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="نام و نام خانوادگی" aria-label="نام" autoComplete="name" /> : null}
      {propBool(p, "showPhone", true) ? <input className="sf-field h-11 px-3" dir="ltr" inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="۰۹۱۲۳۴۵۶۷۸۹" aria-label="موبایل" autoComplete="tel" /> : null}
      {needTerms ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
          <Link href={safeHref(propStr(p, "termsHref", "/pages/terms"))}>{propStr(p, "termsLabel", "قوانین و شرایط را می‌پذیرم")}</Link>
        </label>
      ) : null}
      <button type="submit" className="rounded-full bg-primary py-2.5 font-bold text-primary-foreground">{propStr(p, "submit", "ایجاد حساب")}</button>
      {propStr(p, "loginLabel") ? <Link className="text-center text-sm" href={safeHref(propStr(p, "loginHref", "/login"))}>{propStr(p, "loginLabel")}</Link> : null}
    </form>
  )
}

export function OffCanvasWidget({ widget, editing }: { widget: WidgetNode; editing?: boolean }) {
  const p = widget.props
  const [open, setOpen] = useState(false)
  const side = propStr(p, "side", "start")
  const width = { sm: "18rem", md: "24rem", lg: "32rem", full: "100vw" }[propStr(p, "width", "md")] ?? "24rem"
  const panel: CSSProperties = { width, maxWidth: "100vw", insetInlineStart: side === "start" ? 0 : undefined, insetInlineEnd: side === "end" ? 0 : undefined }
  return (
    <>
      <button type="button" className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground" onClick={() => !editing && setOpen(true)}>
        {propStr(p, "triggerLabel", "باز کردن")}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={propStr(p, "title", "منو")}>
          <button type="button" aria-label="بستن" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 overflow-y-auto bg-card p-5 shadow-xl" style={panel}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold">{propStr(p, "title", "منو")}</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="بستن">✕</button>
            </div>
            {propStr(p, "body") ? <p className="whitespace-pre-line text-sm">{propStr(p, "body")}</p> : null}
            {propStr(p, "ctaLabel") ? (
              <a href={safeHref(propStr(p, "ctaHref"))} className="mt-4 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">{propStr(p, "ctaLabel")}</a>
            ) : null}
          </aside>
        </div>
      ) : null}
    </>
  )
}

export function SiteHeaderWidget({ widget, siteName, logoUrl }: { widget: WidgetNode; siteName?: string; logoUrl?: string | null }) {
  const p = widget.props
  const tone = propStr(p, "tone", "light")
  const logo = safeMedia(propStr(p, "logo")) || logoUrl || ""
  const name = propStr(p, "siteName") || siteName || ""
  const links = parseLinks(p.links, [])
  const toneCls = tone === "dark" ? "bg-foreground text-background" : tone === "transparent" ? "bg-transparent" : "bg-card"
  return (
    <header className={`${toneCls} ${propBool(p, "sticky", true) ? "sticky top-0 z-40" : ""} border-b border-border`}>
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img loading="eager" fetchPriority="high" decoding="async" {...optImg(logo, undefined, true)} alt={name} className="h-9 w-auto" /> : null}
          {!logo || propStr(p, "siteName") ? <span>{name}</span> : null}
        </Link>
        <nav className="ms-auto hidden gap-4 text-sm md:flex">
          {links.map((l, i) => <a key={i} href={safeHref(l.href)}>{l.label}</a>)}
        </nav>
        {propStr(p, "ctaLabel") ? <a href={safeHref(propStr(p, "ctaHref"))} className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">{propStr(p, "ctaLabel")}</a> : null}
      </div>
    </header>
  )
}

export function SiteFooterWidget({ widget, siteName }: { widget: WidgetNode; siteName?: string }) {
  const p = widget.props
  const tone = propStr(p, "tone", "dark")
  const logo = safeMedia(propStr(p, "logo"))
  const columns = parseRows(p.columns, ["title", "label", "href"])
  // Repeater rows carry {title, links:"label|href\n..."}; legacy lines are "title|label|href".
  const grouped = new Map<string, { label: string; href: string }[]>()
  if (Array.isArray(p.columns)) {
    for (const row of p.columns as { title?: string; links?: string }[]) grouped.set(row.title ?? "", parseLinks(row.links ?? "", []))
  } else {
    for (const c of columns) grouped.set(c.title, [...(grouped.get(c.title) ?? []), { label: c.label, href: c.href }])
  }
  const socials = parseRows(p.socials, ["network", "href"]).filter((s) => s.href)
  return (
    <footer className={tone === "dark" ? "bg-foreground text-background" : "bg-card"}>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 md:grid-cols-4">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img loading="lazy" decoding="async" {...optImg(logo, undefined, true)} alt={siteName ?? ""} className="mb-3 h-10 w-auto" /> : <div className="mb-3 font-bold">{siteName}</div>}
          {propStr(p, "blurb") ? <p className="text-sm opacity-80">{propStr(p, "blurb")}</p> : null}
        </div>
        {[...grouped.entries()].map(([title, links]) => (
          <div key={title}>
            <div className="mb-2 font-bold">{title}</div>
            <ul className="grid gap-1 text-sm opacity-80">{links.map((l, i) => <li key={i}><a href={safeHref(l.href)}>{l.label}</a></li>)}</ul>
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 border-t border-current/10 px-4 py-4 text-xs opacity-80">
        <span>{propStr(p, "copyright")}</span>
        <span className="flex gap-3">{socials.map((s, i) => <a key={i} href={safeHref(s.href)} target="_blank" rel="noreferrer">{s.network}</a>)}</span>
      </div>
    </footer>
  )
}

/** Layout containers whose children (sections) are drawn by DocumentView inside this wrapper style. */
export const LAYOUT_CONTAINER_TYPES = new Set(["container", "section", "columns", "flex-container", "grid-container"])

export function layoutContainerStyle(widget: WidgetNode): CSSProperties | undefined {
  const p = widget.props
  const gap = propNum(p, "gap", 16)
  if (widget.type === "flex-container") {
    const map: Record<string, string> = { start: "flex-start", end: "flex-end", center: "center", stretch: "stretch", "space-between": "space-between", "space-around": "space-around" }
    return {
      display: "flex",
      flexDirection: (propStr(p, "direction", "row") as CSSProperties["flexDirection"]) ?? "row",
      justifyContent: map[propStr(p, "justify", "start")] ?? "flex-start",
      alignItems: map[propStr(p, "align", "stretch")] ?? "stretch",
      flexWrap: propStr(p, "wrap", "wrap") === "nowrap" ? "nowrap" : "wrap",
      gap,
    }
  }
  if (widget.type === "grid-container") {
    const template = propStr(p, "template").replace(/[^0-9a-z.%()\s,-]/gi, "")
    return { display: "grid", gridTemplateColumns: template || `repeat(${Math.min(12, Math.max(1, propNum(p, "columns", 2)))}, minmax(0, 1fr))`, gap }
  }
  if (widget.type === "section" || widget.type === "columns") return { display: "grid", gap }
  return undefined
}
