"use client"

/* alikhabari.ir page components (7 approved mockups). Registry: registry-poetry-pages.ts.
 * Colours come from per-widget fields mapped to CSS variables (--akx-*); every image slot has a
 * photoMode (photo | logo | arabesque) so no portrait photo is ever required. Poems come from the
 * Poetry public API; the shop reads the storefront catalog and falls back to a manual (demo) list,
 * and works with the payment gateway off (checkoutMode = inquiry | none). */

import { DEFAULT_POEM_HREF, poemHref } from "./poem-href"
import Link from "next/link"
import { BookOpen, Check, ChevronLeft, ChevronRight, Copy, Home, Menu, Music, Music2, Printer, Search, Share2, ShoppingBag, SlidersHorizontal, User, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import type { CSSProperties, ReactNode } from "react"

import { addToCart } from "../cart"
import type { ShopProduct } from "../catalog"
import { parseRows, propBool, propNum, propStr } from "../props"
import { fetchCatalogPayload, mapCatalogJson } from "../storefront/use-catalog"
import type { WidgetNode } from "../types"
import { useBuilderRuntime } from "./runtime"
import "./poetry-pages-widgets.css"
import { FooterExtras, NavExtras, footerExtraClass, footerExtraStyle } from "./chrome-extras"
import { optImg } from "@/lib/image-url"

type P = Record<string, unknown>
type Term = { id: number; kind: string; slug: string; name: string; count?: number }
type Card = { id: number; slug: string; title: string; excerpt?: string | null; occasion?: Term | null; meter?: Term | null; figures: Term[]; styles: Term[]; style_label?: string | null; pen_name?: string | null; composed_label?: string | null; view_count: number; has_media?: boolean; flags?: Record<string, boolean> | null; published_at?: string | null }
type Block = { type: "title" | "stanza" | "refrain"; layout?: "couplet" | "single"; repeat?: number; lines: string[] }
type Poem = Card & { melody_credit?: string | null; sequence: Block[]; media: { id: number; url: string; kind: string }[]; external_links: { label?: string; url: string }[]; related: Card[] }

const FA = "۰۱۲۳۴۵۶۷۸۹"
const fa = (v: string | number) => String(v).replace(/\d/g, (d) => FA[Number(d)])
const toEn = (v: string) => v.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))

/** `NEXT_PUBLIC_API_URL` may be "", "/api", an origin, or origin + /api; always resolve to …/api/v1. */
export function apiV1(path: string): string {
  const raw = (process.env.NEXT_PUBLIC_API_URL ?? "").trim().replace(/\/+$/, "").replace(/\/api$/, "")
  return `${raw}/api/v1/${path.replace(/^\/+/, "")}`
}

export function safeLink(href: string, fallback = "#"): string {
  const v = (href || "").trim()
  if (!v) return fallback
  return /^(https?:|mailto:|tel:|\/|#|\?)/i.test(v) ? v : fallback
}
const isExternal = (h: string) => /^https?:/i.test(h)

export function toman(raw: string | number): string {
  const n = Number(toEn(String(raw)).replace(/[^\d]/g, ""))
  if (!Number.isFinite(n) || n <= 0) return ""
  return `${fa(n.toLocaleString("en-US").replace(/,/g, "٬"))} تومان`
}

/** Colour fields → CSS variables. */
/** mobileFullWidth (default on): edge-to-edge on phones. */
export const akxMfw = (p: P) => (propBool(p, "mobileFullWidth", true) ? "akx-mfw" : "")

/** transparent / fully see-through colours (transparent, #rgba with 00 alpha, rgba(...,0)) */
export function isClearColor(v: string): boolean {
  const c = v.trim().toLowerCase().replace(/\s+/g, "")
  if (!c) return false
  return c === "transparent" || /^#([0-9a-f]{3}0|[0-9a-f]{6}00)$/.test(c) || /^(rgba|hsla)\(.*,0?\.?0*\)$/.test(c) || /\/0?\.?0*%?\)$/.test(c)
}

export function akxVars(p: P, extra: Record<string, string> = {}): CSSProperties {
  const v: Record<string, string> = {}
  v["--akx-mpy"] = `${Math.max(0, Math.min(160, propNum(p, "mobilePaddingY", 44)))}px`
  v["--akx-mgap"] = `${Math.max(0, Math.min(160, propNum(p, "mobileGap", 28)))}px`
  const map: Record<string, string> = { accent: "--akx-c", ink: "--akx-ink", cream: "--akx-cream", gold: "--akx-gold", card: "--akx-card", sectionBg: "--akx-sec" }
  for (const [k, cssVar] of Object.entries(map)) {
    const val = propStr(p, k)
    if (val && /^[#a-z0-9(),.\s%-]+$/i.test(val)) v[cssVar] = val
  }
  for (const [k, cssVar] of Object.entries(extra)) {
    const val = propStr(p, k)
    if (val && /^[#a-z0-9(),.\s%-]+$/i.test(val)) v[cssVar] = val
  }
  return v as CSSProperties
}

function useQuery(name: string): [string, (v: string) => void] {
  const [v, setV] = useState("")
  useEffect(() => { setV(new URLSearchParams(window.location.search).get(name) ?? "") }, [name])
  return [v, setV]
}

function usePathname(): string {
  const [p, setP] = useState("")
  useEffect(() => { setP(window.location.pathname) }, [])
  return p
}

function useJson<T>(path: string | null): { data: T | null; meta: Record<string, number> | null; loading: boolean } {
  const pre = (useBuilderRuntime() as { prefetch?: Record<string, unknown> }).prefetch
  const key = path ? `/v1/public/poetry/${path}` : null
  const seeded = key && pre && key in pre ? { data: pre[key] as T, meta: (pre[`${key}::meta`] as Record<string, number>) ?? null } : null
  const [state, setState] = useState<{ data: T | null; meta: Record<string, number> | null; loading: boolean }>(() => (seeded ? { ...seeded, loading: false } : { data: null, meta: null, loading: !!path }))
  useEffect(() => {
    if (!path || seeded) return
    let cancelled = false
    setState((s) => ({ ...s, loading: true }))
    fetch(apiV1(`public/poetry/${path}`), { headers: { Accept: "application/json" }, credentials: "include" })
      .then((r) => (r.ok ? r.json() : {}) as Promise<{ data?: unknown; meta?: Record<string, number> }>)
      .then((j) => !cancelled && setState({ data: (j.data ?? null) as T, meta: j.meta ?? null, loading: false }))
      .catch(() => !cancelled && setState({ data: null, meta: null, loading: false }))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])
  return seeded ? { ...seeded, loading: false } : state
}

/* ───────────── shared: photo slot (photo | logo | arabesque) ───────────── */

export function Arabesque({ className = "" }: { className?: string }) {
  return (
    <svg className={`akx-arabesque ${className}`} viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <pattern id="akx-girih" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M20 0 L25 15 L40 20 L25 25 L20 40 L15 25 L0 20 L15 15 Z" fill="none" stroke="currentColor" strokeWidth="1.1" />
          <circle cx="20" cy="20" r="4" fill="none" stroke="currentColor" strokeWidth=".8" />
          <path d="M0 0 L8 8 M40 0 L32 8 M0 40 L8 32 M40 40 L32 32" stroke="currentColor" strokeWidth=".8" />
        </pattern>
      </defs>
      <rect width="120" height="120" fill="url(#akx-girih)" />
    </svg>
  )
}

/** One image slot. mode=photo shows `src` (or the fallback mode when empty); logo/arabesque never show a photo. */
export function PhotoSlot({ mode, src, logo, alt = "", className = "", fallback = "arabesque", children }: { mode: string; src?: string; logo?: string; alt?: string; className?: string; fallback?: "logo" | "arabesque"; children?: ReactNode }) {
  const rt = useBuilderRuntime()
  const logoSrc = logo || rt.logoUrl || ""
  const m = mode === "photo" && src ? "photo" : mode === "photo" ? fallback : mode === "logo" ? "logo" : "arabesque"
  return (
    <div className={`akx-slot akx-slot-${m} ${className}`} data-mode={m}>
      {m === "photo" ? <img src={src} alt={alt} loading="lazy" /> : <Arabesque />}
      {/* logo: eager + sized + optimizer-bypassed (logo rule). A lazy unsized <img> stayed 0×0 until scrolled/fetched, so the slot showed only the arabesque pattern. */}
      {m === "logo" && logoSrc ? <img loading="eager" fetchPriority="low" decoding="async" width={240} height={240} className="akx-slot-logoimg" {...optImg(logoSrc, undefined, true)} alt={alt || rt.siteName || ""} /> : null}
      {m === "logo" && !logoSrc ? <span className="akx-slot-mono">{(alt || rt.siteName || "✦").slice(0, 1)}</span> : null}
      {m === "arabesque" ? <span className="akx-slot-star" aria-hidden>✦</span> : null}
      {children}
    </div>
  )
}

const SOCIAL_LABELS: Record<string, string> = { eitaa: "ایتا", telegram: "تلگرام", instagram: "اینستاگرام", bale: "بله", youtube: "یوتیوب", aparat: "آپارات" }
const SOCIAL_SHORT: Record<string, string> = { eitaa: "ای", telegram: "تل", instagram: "اینستا", bale: "بله", youtube: "یو", aparat: "آپ" }
const socialsOf = (v: unknown) => parseRows(v, ["network", "href", "label"]).filter((r) => r.href)

function Play({ size = 24, light = false }: { size?: number; light?: boolean }) {
  return <span className={`akx-play ${light ? "akx-play-light" : ""}`} style={{ width: size, height: size }} aria-hidden><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" /></svg></span>
}
function SearchIcon() {
  return <svg className="akx-ico" viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m20 20-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
}

function SearchBox({ placeholder, action, initial = "" }: { placeholder: string; action: string; initial?: string }) {
  return (
    <form className="akx-search" action={safeLink(action, "/poems")} method="get" role="search">
      <SearchIcon />
      <input name="q" defaultValue={initial} placeholder={placeholder} aria-label={placeholder || "جستجو"} />
    </form>
  )
}

function Pager({ page, last, onPage }: { page: number; last: number; onPage: (n: number) => void }) {
  if (last <= 1) return null
  const pages: (number | "…")[] = []
  for (let i = 1; i <= last; i++) {
    if (i === 1 || i === last || Math.abs(i - page) <= 1) pages.push(i)
    else if (pages[pages.length - 1] !== "…") pages.push("…")
  }
  return (
    <nav className="akx-pager" dir="rtl" aria-label="صفحه‌بندی">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="صفحه قبلی"><ChevronRight size={16} aria-hidden /></button>
      {pages.map((n, i) => n === "…" ? <span key={`e${i}`}>…</span> : <button type="button" key={n} className={n === page ? "is-on" : ""} aria-current={n === page ? "page" : undefined} onClick={() => onPage(n)}>{fa(n)}</button>)}
      <button type="button" disabled={page >= last} onClick={() => onPage(page + 1)} aria-label="صفحه بعدی"><ChevronLeft size={16} aria-hidden /></button>
    </nav>
  )
}

/** Desktop: a normal sticky sidebar. Mobile (≤760px): hidden behind a «فیلتر» button that opens a bottom sheet. */
function FilterSide({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    window.addEventListener("keydown", k)
    return () => window.removeEventListener("keydown", k)
  }, [open])
  return (
    <>
      <button type="button" className="akx-filter-btn" aria-expanded={open} onClick={() => setOpen(true)}><SlidersHorizontal size={16} aria-hidden />{label}</button>
      {open ? <div className="akx-sheet-scrim" onClick={() => setOpen(false)} aria-hidden /> : null}
      <aside className={`akx-side ${open ? "is-open" : ""}`} aria-label={label}>
        <div className="akx-sheet-head"><b>{label}</b><button type="button" onClick={() => setOpen(false)} aria-label="بستن"><X size={18} aria-hidden /></button></div>
        {children}
        <button type="button" className="akx-sheet-done" onClick={() => setOpen(false)}>نمایش نتایج</button>
      </aside>
    </>
  )
}

/* ───────────── 1) nav ───────────── */
export function PoetryNavWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const rt = useBuilderRuntime()
  const path = usePathname()
  const [menu, setMenu] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { setMenu(false) }, [path])
  useEffect(() => {
    if (!menu) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false) }
    window.addEventListener("keydown", k)
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", k) }
  }, [menu])
  const links = parseRows(p.links, ["label", "href"]).filter((l) => l.label)
  const logo = propStr(p, "logo") || rt.logoUrl || ""
  const logoOnly = propBool(p, "logoOnly", false)
  const px = (k: string, d: number) => `${Math.max(24, Math.min(160, propNum(p, k, d)))}px`
  const capsuleBg = propStr(p, "capsuleBg").trim()
  const capsuleClear = isClearColor(capsuleBg)
  const navVars = { ...akxVars({ ...p, navBg: capsuleBg || propStr(p, "navBg") }, { navBg: "--akx-nav", searchBg: "--akx-sbg" }), ...(capsuleBg && /^[#a-z0-9(),.\s%-]+$/i.test(capsuleBg) ? { ["--akx-nav" as string]: capsuleBg } : {}), ["--akx-logo-h" as string]: px("logoHeight", 64), ["--akx-logo-hm" as string]: px("logoHeightMobile", 48) } as CSSProperties
  const drawerVars = akxVars(p, { drawerBg: "--akx-drawer", drawerText: "--akx-drawer-tx" })
  const active = (href: string) => {
    if (!path || !href) return false
    if (href === "/") return path === "/"
    return path === href || path.startsWith(`${href}/`) || (href === "/poems" && path.startsWith("/poem"))
  }
  return (
    <header className={`akx akx-navwrap ${akxMfw(p)} ${logoOnly && logo ? "akx-logo-only" : ""}`} dir="rtl" style={navVars}>
      <div data-capsule={capsuleClear ? "clear" : undefined} className={`akx-nav ${propBool(p, "searchWide", false) ? "akx-search-wide" : ""} ${capsuleClear ? "akx-nav-clear" : ""} ${!capsuleClear && propBool(p, "capsuleShadow", true) ? "" : "akx-nav-flat"} ${propBool(p, "capsuleBorder", false) ? "akx-nav-bordered" : ""}`}>
        <Link href="/" className="akx-brand">
          {logo ? <img loading="eager" fetchPriority="high" decoding="async" {...optImg(logo, undefined, true)} alt={logoOnly ? propStr(p, "brand", rt.siteName ?? "") : ""} /> : null}
          {logoOnly && logo ? null : <b>{propStr(p, "brand", rt.siteName ?? "")}</b>}
        </Link>
        <nav className="akx-links" aria-label="منوی اصلی">
          {links.map((l, i) => <Link key={i} href={safeLink(l.href, "/")} className={active(l.href) ? "is-on" : ""}>{l.label}</Link>)}
        </nav>
        {propBool(p, "showSearch", true) ? <SearchBox placeholder={propStr(p, "searchPlaceholder")} action={propStr(p, "searchHref", "/poems")} /> : null}
        <NavExtras p={p} />
        <button type="button" className="akx-burger" aria-label="باز کردن منو" aria-expanded={menu} onClick={() => setMenu(true)}><Menu size={22} aria-hidden /></button>
      </div>
      {mounted ? createPortal(<div className="akx akx-drawer-root" dir="rtl" style={drawerVars}>
        {menu ? <div className="akx-drawer-scrim" onClick={() => setMenu(false)} aria-hidden /> : null}
      <div className={`akx-drawer ${menu ? "is-open" : ""}`} role="dialog" aria-modal={menu} aria-label="منو" aria-hidden={!menu}>
        <div className="akx-drawer-head">
          <b>{propStr(p, "brand", rt.siteName ?? "")}</b>
          <button type="button" onClick={() => setMenu(false)} aria-label="بستن منو" tabIndex={menu ? 0 : -1}><X size={22} aria-hidden /></button>
        </div>
        {propBool(p, "showSearch", true) ? <SearchBox placeholder={propStr(p, "searchPlaceholder")} action={propStr(p, "searchHref", "/poems")} /> : null}
        <nav aria-label="منوی موبایل">
          {links.map((l, i) => <Link key={i} href={safeLink(l.href, "/")} className={active(l.href) ? "is-on" : ""} onClick={() => setMenu(false)} tabIndex={menu ? 0 : -1}>{l.label}<ChevronLeft size={16} aria-hidden /></Link>)}
        </nav>
      </div>
      </div>, document.body) : null}
      {propBool(p, "bottomBar", false) ? <NavTabBar items={parseRows(p.bottomItems, ["label", "href", "icon"]).filter((l) => l.label)} fallback={links} active={active} /> : null}
    </header>
  )
}

const TAB_ICONS: Record<string, typeof Home> = { home: Home, book: BookOpen, music: Music, shop: ShoppingBag, user: User, search: Search }
function NavTabBar({ items, fallback, active }: { items: Record<string, string>[]; fallback: Record<string, string>[]; active: (h: string) => boolean }) {
  const list: Record<string, string>[] = (items.length ? items : fallback.slice(0, 5).map((l, i) => ({ ...l, icon: ["home", "book", "music", "shop", "user"][i] ?? "home" }))).slice(0, 6)
  if (!list.length) return null
  return (
    <nav className="akx-tabbar" aria-label="نوار پایین">
      {list.map((l, i) => { const I = TAB_ICONS[l.icon] ?? Home; return <Link key={i} href={safeLink(l.href, "/")} className={active(l.href) ? "is-on" : ""} aria-current={active(l.href) ? "page" : undefined}><I size={20} aria-hidden />{l.label}</Link> })}
    </nav>
  )
}

/* ───────────── 2) page hero ───────────── */
export function PoetryPageHeroWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const [poemQ] = useQuery("poem")
  const fromPoem = propBool(p, "fromPoem", false)
  const { data: poem } = useJson<Poem>(fromPoem && poemQ ? `poems/${encodeURIComponent(poemQ)}` : null)
  const crumbs = parseRows(p.crumbs, ["label", "href"]).filter((c) => c.label)
  let title = propStr(p, "title"); let hi = propStr(p, "highlight")
  if (fromPoem && poem?.title) {
    const w = poem.title.split(/\s+/)
    title = w.slice(0, Math.max(1, w.length - 2)).join(" "); hi = w.length > 1 ? w.slice(-2).join(" ") : ""
    if (crumbs.length) crumbs[crumbs.length - 1] = { label: poem.title, href: "" }
  }
  const img = propStr(p, "image")
  const mode = propStr(p, "photoMode", "photo")
  const showImg = mode === "photo" && img
  const style = { ...akxVars(p, { bg: "--akx-hero" }), minHeight: propNum(p, "height", 210) } as CSSProperties
  return (
    <section className={`akx akx-ph ${akxMfw(p)}`} dir="rtl" style={style}>
      {showImg ? <div className="akx-ph-img" style={{ backgroundImage: `url("${img.replace(/"/g, "")}")` }} aria-hidden /> : <PhotoSlot mode={mode === "photo" ? "arabesque" : mode} logo={propStr(p, "logo")} className="akx-ph-slot" />}
      <div className="akx-ph-body">
        {crumbs.length ? (
          <nav className="akx-crumbs" aria-label="مسیر">
            {crumbs.map((c, i) => <span key={i}>{i ? " / " : ""}{c.href ? <Link href={safeLink(c.href, "/")}>{c.label}</Link> : c.label}</span>)}
          </nav>
        ) : null}
        <h1>{title} {hi ? <span>{hi}</span> : null}</h1>
        {propBool(p, "showSearch", false) ? <SearchBox placeholder={propStr(p, "searchPlaceholder")} action={propStr(p, "searchHref", "/poems")} /> : null}
      </div>
    </section>
  )
}

/* ───────────── 3) poem archive ───────────── */
function yearOf(c: Card): string {
  const m = toEn(c.composed_label ?? "").match(/1[34]\d\d/)
  return m ? fa(m[0]) : ""
}
function PoemCardItem({ c, href, newLabel }: { c: Card; href: string; newLabel: string }) {
  const meta = [c.style_label || c.styles[0]?.name, yearOf(c)].filter(Boolean).join(" · ")
  const tag = c.figures[0]?.name || c.occasion?.name
  const link = poemHref(href, c)
  return (
    <article className="akx-pc">
      {meta ? <div className="akx-k">{meta}</div> : null}
      <h3><Link href={link} className="akx-stretch">{c.title}</Link></h3>
      {c.excerpt ? <p className="akx-v">{c.excerpt}</p> : null}
      <div className="akx-pc-foot">
        <div>{tag ? <span className="akx-tag">{tag}</span> : null}{c.flags?.is_new && newLabel ? <span className="akx-tag2">{newLabel}</span> : null}</div>
        {c.has_media ? <Link href={`${link}#media`} aria-label="پخش"><Play /></Link> : null}
      </div>
    </article>
  )
}

export function PoemArchiveWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const perPage = Math.min(48, propNum(p, "perPage", 12))
  const [qParam] = useQuery("q")
  const [occParam] = useQuery("occasion")
  const [figParam] = useQuery("figure")
  const [f, setF] = useState<{ figure: string; style: string; occasion: string; media: boolean; chip: string; page: number }>({ figure: "", style: "", occasion: "", media: false, chip: "all", page: 1 })
  useEffect(() => { if (occParam || figParam) setF((s) => ({ ...s, occasion: occParam || s.occasion, figure: figParam || s.figure })) }, [occParam, figParam])
  const { data: terms } = useJson<Term[]>(propBool(p, "showSidebar", true) ? "terms" : null)
  const qs = new URLSearchParams({ per_page: String(perPage), page: String(f.page) })
  if (qParam) qs.set("q", qParam)
  for (const k of ["figure", "style", "occasion"] as const) if (f[k]) qs.set(k, f[k])
  if (f.media || f.chip === "media") qs.set("has_media", "1")
  if (f.chip === "popular") qs.set("sort", "popular")
  if (f.chip === "new") qs.set("flag", "is_new")
  if (f.chip === "unread") qs.set("flag", "not_performed")
  const { data, meta, loading } = useJson<Card[]>(`poems?${qs.toString()}`)
  const last = meta?.last_page ?? 1
  const set = (patch: Partial<typeof f>) => setF((s) => ({ ...s, page: 1, ...patch }))
  const showCounts = propBool(p, "showCounts", true)
  const facet = (kind: "figure" | "style" | "occasion", titleKey: string, fallback: string) => {
    const list = (terms ?? []).filter((t) => t.kind === kind && (!showCounts || (t.count ?? 0) > 0 || f[kind] === t.slug))
    if (!list.length) return null
    return (
      <div className="akx-facet">
        <h4>{propStr(p, titleKey, fallback)}</h4>
        {list.map((t) => (
          <button type="button" key={t.id} className={`akx-ck ${f[kind] === t.slug ? "is-on" : ""}`} aria-pressed={f[kind] === t.slug} onClick={() => set({ [kind]: f[kind] === t.slug ? "" : t.slug } as Partial<typeof f>)}>
            <span>{t.name}</span>{showCounts && typeof t.count === "number" ? <i>{fa(t.count)}</i> : null}
          </button>
        ))}
      </div>
    )
  }
  const chips: [string, string][] = [["all", propStr(p, "chipAll", "همه")], ["new", propStr(p, "chipNew", "تازه‌ترین")], ["popular", propStr(p, "chipPopular", "پربازدیدترین")], ["media", propStr(p, "chipMedia", "دارای صوت")], ["unread", propStr(p, "chipUnread", "خوانده‌نشده")]]
  return (
    <section className={`akx akx-arch ${akxMfw(p)}`} dir="rtl" style={akxVars(p)}>
      {propBool(p, "showSidebar", true) ? (
        <FilterSide label={propStr(p, "filterLabel", "فیلتر")}>
          {facet("figure", "figureTitle", "شخصیت")}
          {facet("style", "styleTitle", "سبک")}
          {facet("occasion", "occasionTitle", "مناسبت")}
          <div className="akx-facet">
            <h4>{propStr(p, "mediaTitle", "رسانه")}</h4>
            <button type="button" className={`akx-ck ${f.media ? "is-on" : ""}`} aria-pressed={f.media} onClick={() => set({ media: !f.media })}><span>{propStr(p, "hasMediaLabel", "دارای صوت/ویدیو")}</span></button>
          </div>
        </FilterSide>
      ) : null}
      <div className="akx-main">
        <div className="akx-pills" role="tablist">
          {chips.filter(([, l]) => l).map(([k, l]) => <button type="button" role="tab" key={k} aria-selected={f.chip === k} className={f.chip === k ? "is-on" : ""} onClick={() => set({ chip: k })}>{l}</button>)}
        </div>
        {loading && !data ? <div className="akx-grid3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="akx-pc akx-skel" />)}</div> : null}
        {data && data.length ? <div className="akx-grid3">{data.map((c) => <PoemCardItem key={c.id} c={c} href={propStr(p, "detailHref", "/poem")} newLabel={propStr(p, "newLabel", "جدید")} />)}</div> : null}
        {data && !data.length ? <p className="akx-empty">{propStr(p, "emptyText", "شعری یافت نشد.")}</p> : null}
        <Pager page={f.page} last={last} onPage={(n) => { setF((s) => ({ ...s, page: n })); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }) }} />
      </div>
    </section>
  )
}

/* ───────────── 4) single poem ───────────── */
function beyts(lines: string[]): string[][] {
  const out: string[][] = []
  for (let i = 0; i < lines.length; i += 2) out.push(lines.slice(i, i + 2))
  return out
}
function plain(p: Poem): string {
  const out = [p.title, ""]
  for (const b of p.sequence) { if (b.type === "title") continue; out.push(...b.lines, "") }
  if (p.pen_name) out.push(`— ${p.pen_name}`)
  return out.join("\n")
}

export function PoemSingleWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const [qSlug] = useQuery("poem")
  const slug = propStr(p, "slug") || qSlug
  const { data: poem, loading } = useJson<Poem>(slug ? `poems/${encodeURIComponent(slug)}` : null)
  const [size, setSize] = useState(0)
  const [fav, setFav] = useState(false)
  const [note, setNote] = useState("")
  useEffect(() => { if (poem) setFav(localStorage.getItem(`akx-fav:${poem.slug}`) === "1") }, [poem])
  const flash = (t: string) => { setNote(t); window.setTimeout(() => setNote(""), 1800) }
  if (!slug) return <section className={`akx akx-sg-empty ${akxMfw(p)}`} dir="rtl" style={akxVars(p)}>شعری انتخاب نشده است.</section>
  if (loading && !poem) return <section className={`akx akx-sg ${akxMfw(p)} ${akxMfw(p)}`} dir="rtl" style={akxVars(p)}><div className="akx-paper akx-skel" style={{ minHeight: 480 }} /></section>
  if (!poem) return <section className={`akx akx-sg-empty ${akxMfw(p)}`} dir="rtl" style={akxVars(p)}>این شعر یافت نشد.</section>
  const sep = propStr(p, "separator", "✦ ✦ ✦")
  const sub = [poem.style_label || poem.styles[0]?.name, poem.figures[0]?.name].filter(Boolean).join(" · ")
  const audio = poem.media.find((m) => m.kind === "audio")
  const video = poem.media.find((m) => m.kind === "video")
  const tools = propBool(p, "showTools", true)
  const blocks = poem.sequence.filter((b) => b.type !== "title")
  const copy = async () => { try { await navigator.clipboard.writeText(plain(poem)); flash("متن کپی شد") } catch { flash("کپی ممکن نشد") } }
  const share = async () => {
    const url = window.location.href
    const nav = navigator as Navigator & { share?: (d: { title: string; url: string }) => Promise<void> }
    try { if (nav.share) await nav.share({ title: poem.title, url }); else { await navigator.clipboard.writeText(url); flash("پیوند کپی شد") } } catch { /* cancelled */ }
  }
  const toggleFav = () => { const v = !fav; setFav(v); localStorage.setItem(`akx-fav:${poem.slug}`, v ? "1" : "0") }
  const specs: [string, string][] = [
    ["شخصیت", poem.figures.map((x) => x.name).join("، ")], ["مناسبت", poem.occasion?.name ?? ""], ["سبک", poem.style_label || poem.styles.map((x) => x.name).join("، ")],
    ["وزن", poem.meter?.name || propStr(p, "meterFallback", "")], ["تاریخ سرایش", poem.composed_label ?? ""], ["بازدید", fa(poem.view_count)],
  ]
  return (
    <section className={`akx akx-sg ${akxMfw(p)} ${propBool(p, "showSidebar", true) ? "" : "akx-sg-solo"}`} dir="rtl" style={akxVars(p, { refrainBg: "--akx-ref" })}>
      <article className="akx-paper" style={{ fontSize: `${18 + size * 2}px` }}>
        {propStr(p, "heading") ? <div className="akx-bism">{propStr(p, "heading")}</div> : null}
        {propBool(p, "showSubtitle", true) && sub ? <div className="akx-sub">{sub}</div> : null}
        {blocks.map((b, i) => {
          const prevRef = i > 0 && blocks[i - 1].type === "refrain"
          if (b.type === "refrain") return <div key={i} className="akx-br">{b.lines.map((l, j) => <span key={j}>{l}</span>)}</div>
          return (
            <div key={i}>
              {i > 0 && !prevRef && sep ? <div className="akx-sep" aria-hidden>{sep}</div> : null}
              {b.layout === "single" ? b.lines.map((l, j) => <p key={j} className="akx-single">{l}</p>) : beyts(b.lines).map((bt, j) => <div key={j} className="akx-bayt"><span>{bt[0]}</span><span>{bt[1] ?? ""}</span></div>)}
            </div>
          )
        })}
        {poem.melody_credit ? <div className="akx-sub">{poem.melody_credit}</div> : null}
        <div className="akx-sign">{propStr(p, "signPrefix", "✍")} <b>{poem.pen_name || ""}</b>{propStr(p, "signNote") ? ` · ${propStr(p, "signNote")}` : ""}{poem.composed_label ? ` · ${poem.composed_label}` : ""}</div>
        {tools ? (
          <div className="akx-tools">
            <button type="button" onClick={copy}><Copy size={16} aria-hidden />کپی متن</button>
            <button type="button" onClick={() => window.print()}><Printer size={16} aria-hidden />چاپ</button>
            <button type="button" onClick={share}><Share2 size={16} aria-hidden />اشتراک‌گذاری</button>
            <button type="button" onClick={toggleFav} aria-pressed={fav}>{fav ? "♥" : "♡"} علاقه‌مندی</button>
            <button type="button" onClick={() => setSize((s) => (s + 1) % 4)}>A+ اندازه متن</button>
            {note ? <span className="akx-note" role="status">{note}</span> : null}
          </div>
        ) : null}
      </article>
      {propBool(p, "showSidebar", true) ? (
        <aside className="akx-sgside">
          <div className="akx-box akx-player" id="media">
            {video ? <video src={video.url} controls preload="none" /> : audio ? <audio src={audio.url} controls preload="none" /> : <div className="akx-player-ph"><Play size={44} light /></div>}
            {poem.external_links.map((l, i) => <a key={i} href={safeLink(l.url)} target="_blank" rel="noopener noreferrer">{l.label || "مشاهده اجرا"}</a>)}
            {propStr(p, "playerNote") ? <small>{propStr(p, "playerNote")}</small> : null}
          </div>
          <div className="akx-box">
            <h4>{propStr(p, "specsTitle", "مشخصات شعر")}</h4>
            {specs.filter(([, v]) => v).map(([k, v]) => <div key={k} className="akx-kv"><span>{k}</span><b>{v}</b></div>)}
          </div>
          {poem.related.length ? (
            <div className="akx-box">
              <h4>{propStr(p, "relatedTitle", "اشعار مرتبط")}</h4>
              {poem.related.map((r) => (
                <Link key={r.id} className="akx-rel" href={poemHref(propStr(p, "detailHref", DEFAULT_POEM_HREF), r)}>
                  <b>{r.title}</b><small>{[r.style_label || r.styles[0]?.name, r.figures[0]?.name].filter(Boolean).join(" · ")}</small>
                </Link>
              ))}
            </div>
          ) : null}
        </aside>
      ) : null}
    </section>
  )
}

/* ───────────── 5) media archive ───────────── */
type MediaItem = { title: string; cover: string; kind: string; src: string; duration: string; tag: string; poem: string; reciter: string }
export function MediaArchiveWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const items = parseRows(p.items, ["title", "cover", "kind", "src", "duration", "tag", "poem", "reciter"]).filter((r) => r.title) as MediaItem[]
  const filters = propStr(p, "filters", "همه").split(/[,،]/).map((s) => s.trim()).filter(Boolean)
  const audioL = propStr(p, "audioLabel", "صوت"); const videoL = propStr(p, "videoLabel", "ویدیو")
  const kindLabel = (k: string) => (k === "video" ? videoL : audioL)
  const [chip, setChip] = useState(filters[0] ?? "")
  const [page, setPage] = useState(1)
  const [sel, setSel] = useState(Math.max(0, Math.min(items.length - 1, propNum(p, "featured", 1) - 1)))
  const [playing, setPlaying] = useState(false)
  const shown = items.filter((it) => !chip || chip === filters[0] || chip === kindLabel(it.kind) || it.tag === chip)
  const per = propNum(p, "perPage", 8)
  const last = Math.max(1, Math.ceil(shown.length / per))
  const pageItems = shown.slice((page - 1) * per, page * per)
  const cur = items[sel]
  const cm = propStr(p, "coverMode", "arabesque")
  const pick = (it: MediaItem) => { setSel(items.indexOf(it)); setPlaying(true); if (typeof window !== "undefined") document.getElementById(`akx-feat-${widget.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }) }
  if (!items.length) return (
    <section className={`akx akx-media-empty ${akxMfw(p)}`} dir="rtl" style={akxVars(p)}>
      <div className="akx-empty-card"><span className="akx-empty-ic"><Music2 size={22} aria-hidden /></span><b>{propStr(p, "emptyTitle", "هنوز اجرایی ثبت نشده است")}</b><p>{propStr(p, "emptyText", "به‌زودی صوت و تصویر اجراها در این بخش قرار می‌گیرد.")}</p><Link href="/poems" className="akx-b1">مشاهده اشعار</Link></div>
    </section>
  )
  const top = items.slice(0, propNum(p, "topCount", 4))
  return (
    <section className={`akx akx-media ${akxMfw(p)}`} dir="rtl" style={akxVars(p)}>
      <div className="akx-bigp">
        {top.length ? (
          <div className="akx-box akx-toplist">
            <h4>{propStr(p, "topTitle", "پرشنونده‌ترین‌ها")}</h4>
            {top.map((it, i) => (
              <button type="button" key={i} className={`akx-row ${items.indexOf(it) === sel ? "is-on" : ""}`} onClick={() => pick(it)}>
                <span className="akx-num">{fa(i + 1)}</span><b>{it.title}</b><span className="akx-tag">{kindLabel(it.kind)}</span><small>{fa(it.duration)}</small><Play />
              </button>
            ))}
          </div>
        ) : null}
        <div className="akx-feat" id={`akx-feat-${widget.id}`}>
          {cur && playing && cur.src ? (cur.kind === "video" ? <video src={cur.src} poster={cur.cover || undefined} controls autoPlay /> : (
            <div className="akx-feat-audio"><PhotoSlot mode={cur.cover ? "photo" : cm} src={cur.cover} logo={propStr(p, "logo")} /><audio src={cur.src} controls autoPlay /></div>
          )) : cur ? (
            <button type="button" className="akx-feat-cover" onClick={() => setPlaying(true)} aria-label={`پخش ${cur.title}`}>
              <PhotoSlot mode={cur.cover ? "photo" : cm} src={cur.cover} logo={propStr(p, "logo")} alt={cur.title} />
              <span className="akx-bigplay"><Play size={70} /></span>
              <span className="akx-feat-cap"><b>{cur.title}</b>{[cur.poem, cur.reciter].filter(Boolean).join(" · ")}</span>
            </button>
          ) : null}
        </div>
      </div>
      <div className="akx-pills">
        {filters.map((c) => <button type="button" key={c} className={chip === c ? "is-on" : ""} onClick={() => { setChip(c); setPage(1) }}>{c}</button>)}
      </div>
      <div className="akx-grid4">
        {pageItems.map((it, i) => (
          <button type="button" key={i} className="akx-mc" onClick={() => pick(it)}>
            <div className="akx-mc-img">
              <PhotoSlot mode={it.cover ? "photo" : cm} src={it.cover} logo={propStr(p, "logo")} alt={it.title} />
              <span className="akx-badge">{kindLabel(it.kind)}</span>
              {it.duration ? <span className="akx-dur">{fa(it.duration)}</span> : null}
              <span className="akx-mc-play"><Play size={34} light /></span>
            </div>
            <b>{it.title}</b>
            <small>{[it.poem && `شعر مرتبط: ${it.poem}`, it.reciter].filter(Boolean).join(" · ")}</small>
          </button>
        ))}
      </div>
      <Pager page={page} last={last} onPage={setPage} />
    </section>
  )
}

/* ───────────── shop helpers ───────────── */
type Item = { slug: string; title: string; image: string; images: string[]; price: number; old: number; href: string; category: string; categorySlug: string; size: string; demo: boolean; inStock: boolean; live: boolean; productId?: number; description: string; options: string[] }
/** SiteBuilder marks demo products with a `demo-` slug prefix or «(نمونه)»/[demo] in the name. */
export const isDemoProduct = (slug: string, name: string) => /^demo-|-demo$/i.test(slug) || /\(نمونه\)|\[demo\]|«نمونه»/i.test(name)
const cleanName = (n: string) => n.replace(/\s*(\(نمونه\)|\[demo\]|«نمونه»)\s*/gi, " ").trim()

function fromProduct(x: ShopProduct): Item {
  return { slug: x.slug, title: cleanName(x.name), image: x.image || x.images[0] || "", images: x.images.length ? x.images : x.image ? [x.image] : [], price: x.price || 0, old: x.compare && x.compare > x.price ? x.compare : 0, href: `/product/${encodeURIComponent(x.slug)}`, category: x.category, categorySlug: x.categorySlug, size: "", demo: isDemoProduct(x.slug, x.name), inStock: x.inStock, live: true, productId: x.id, description: x.description, options: x.variants.map((v) => v.name).filter(Boolean) }
}
function manualItems(p: P): Item[] {
  return parseRows(p.items, ["title", "image", "price", "oldPrice", "href", "category", "size", "demo"]).filter((r) => r.title).map((r, i) => {
    const slug = `manual-${i + 1}`
    const href = r.href || (propStr(p, "productHref") ? `${propStr(p, "productHref")}?item=${i + 1}` : "")
    return { slug, title: r.title, image: r.image, images: r.image ? [r.image] : [], price: Number(toEn(r.price).replace(/[^\d]/g, "")) || 0, old: Number(toEn(r.oldPrice).replace(/[^\d]/g, "")) || 0, href, category: r.category, categorySlug: r.category, size: r.size, demo: /^(1|true|yes|بله|نمونه|demo)$/i.test(r.demo.trim()), inStock: true, live: false, description: "", options: [] }
  })
}

export function useCatalog(enabled: boolean, query: string): { items: ShopProduct[] | null; cats: { slug: string; name: string }[] } {
  // SSR seed (server-prefetch.ts) so products are in the HTML; client fetch only when the query changes.
  const pre = (useBuilderRuntime() as { prefetch?: Record<string, unknown> }).prefetch
  const raw = enabled && pre ? pre[`catalog::${query}`] : undefined
  const seeded = raw ? mapCatalogJson(raw as Parameters<typeof mapCatalogJson>[0]) : null
  const seed = seeded ? { items: seeded.items, cats: seeded.categories.map((c) => ({ slug: c.slug, name: c.name })) } : null
  const [s, setS] = useState<{ items: ShopProduct[] | null; cats: { slug: string; name: string }[] }>(() => seed ?? { items: null, cats: [] })
  useEffect(() => {
    if (!enabled) { setS({ items: [], cats: [] }); return }
    if (seed) return
    let off = false
    fetchCatalogPayload(query).then((r) => { if (!off) setS({ items: r?.items ?? [], cats: (r?.categories ?? []).map((c) => ({ slug: c.slug, name: c.name })) }) }).catch(() => !off && setS({ items: [], cats: [] }))
    return () => { off = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, query])
  return seed ?? s
}

function PriceLine({ p, it }: { p: P; it: Item }) {
  const text = propStr(p, "priceText", "قیمت (از مشتری)")
  if (propStr(p, "priceMode", "auto") === "text" || !it.price) return <em>{text}</em>
  return <>{it.old ? <s>{toman(it.old)}</s> : null}<em>{toman(it.price)}</em></>
}

function BuyButton({ p, it, qty = 1, big = false, option = "" }: { p: P; it: Item; qty?: number; big?: boolean; option?: string }) {
  const mode = propStr(p, "checkoutMode", "inquiry")
  const [done, setDone] = useState(false)
  if (mode === "none") return null
  if (mode === "cart" && it.live && it.price > 0 && it.inStock) {
    return <button type="button" className={`akx-b1 ${big ? "akx-b1-big" : ""}`} onClick={() => { addToCart({ slug: it.slug, name: option ? `${it.title} (${option})` : it.title, price: it.price, tone: "", image: it.image || null, productId: it.productId }, qty); setDone(true); window.setTimeout(() => setDone(false), 1600) }}>{done ? <><Check size={16} aria-hidden /> افزوده شد</> : propStr(p, "cartLabel", "افزودن به سبد")}</button>
  }
  const base = safeLink(propStr(p, "inquiryHref"), "")
  const label = propStr(p, "inquiryLabel", "استعلام و سفارش")
  if (!base) return <span className={`akx-b1 akx-b1-off ${big ? "akx-b1-big" : ""}`}>{label}</span>
  return <a className={`akx-b1 ${big ? "akx-b1-big" : ""}`} href={base} target={isExternal(base) ? "_blank" : undefined} rel="noopener noreferrer">{label}</a>
}

const RATIO: Record<string, string> = { "4/5": "4 / 5", "3/4": "3 / 4", "2/3": "2 / 3", "1/1": "1 / 1", "16/10": "16 / 10" }
function ProductCard({ p, it }: { p: P; it: Item }) {
  const body = (
    <>
      <div className="akx-pr-img" style={{ ["--akx-pr-ratio" as string]: RATIO[propStr(p, "imageRatio", "4/5")] ?? "4 / 5" } as CSSProperties}><PhotoSlot mode={it.image ? "photo" : propStr(p, "imageMode", "arabesque")} src={it.image} logo={propStr(p, "logo")} alt={it.title} /></div>
      <b className="akx-pr-name">{it.title}</b>
      <div className="akx-price"><PriceLine p={p} it={it} /></div>
    </>
  )
  return (
    <article className="akx-pr">
      {it.old && it.price && propStr(p, "discountLabel") ? <span className="akx-off">{propStr(p, "discountLabel")}</span> : null}
      {it.demo && propStr(p, "demoLabel") ? <span className="akx-demo">{propStr(p, "demoLabel")}</span> : null}
      {it.href ? <Link href={safeLink(it.href, "#")} className="akx-pr-link">{body}</Link> : <div className="akx-pr-link">{body}</div>}
      <BuyButton p={p} it={it} />
    </article>
  )
}

/* ───────────── 6) shop ───────────── */
export function PoetryShopWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const live = propStr(p, "source", "catalog") !== "manual"
  const [sort, setSort] = useState("newest")
  const [cat, setCat] = useState("")
  const [size, setSize] = useState("")
  const [stock, setStock] = useState(false)
  const [sale, setSale] = useState(false)
  const [page, setPage] = useState(1)
  const [catParam] = useQuery("category")
  useEffect(() => { if (catParam) setCat(catParam) }, [catParam])
  const { items: catalog, cats } = useCatalog(live, "per_page=60&sort=newest")
  const manual = useMemo(() => manualItems(p), [p])
  const useLive = live && !!catalog && catalog.length > 0
  const all: Item[] = useLive ? (catalog as ShopProduct[]).map(fromProduct) : manual
  const categories = useLive && cats.length ? cats : Array.from(new Set(all.map((i) => i.category).filter(Boolean))).map((c) => ({ slug: c, name: c }))
  const sizes = propStr(p, "sizes").split(/[,،]/).map((s) => s.trim()).filter(Boolean)
  let list = all.filter((i) => (!cat || i.categorySlug === cat) && (!size || i.size === size || i.options.some((o) => o.includes(size)) || i.title.includes(size)) && (!stock || i.inStock) && (!sale || i.old > 0))
  if (sort === "cheap") list = [...list].sort((a, b) => (a.price || Infinity) - (b.price || Infinity))
  if (sort === "best") list = [...list].sort((a, b) => Number(b.old > 0) - Number(a.old > 0))
  const per = propNum(p, "perPage", 12)
  const last = Math.max(1, Math.ceil(list.length / per))
  const shown = list.slice((page - 1) * per, page * per)
  const anyDemo = all.some((i) => i.demo)
  const go = (fn: () => void) => { fn(); setPage(1) }
  const sorts: [string, string][] = [["newest", propStr(p, "sortNew", "جدیدترین")], ["best", propStr(p, "sortBest", "پرفروش‌ترین")], ["cheap", propStr(p, "sortCheap", "ارزان‌ترین")]]
  const loading = live && catalog === null && !manual.length
  return (
    <section className={`akx akx-shop ${akxMfw(p)}`} dir="rtl" style={{ ...akxVars(p), ["--akx-cols" as string]: String(Math.min(5, Math.max(2, propNum(p, "columns", 4)))) } as CSSProperties}>
      {propBool(p, "showSidebar", true) ? (
        <FilterSide label={propStr(p, "filterLabel", "فیلتر")}>
          {categories.length ? (
            <div className="akx-facet">
              <h4>{propStr(p, "categoryTitle", "دسته‌بندی")}</h4>
              <button type="button" className={`akx-ck ${!cat ? "is-on" : ""}`} onClick={() => go(() => setCat(""))}><span>{propStr(p, "allLabel", "همه")}</span><i>{fa(all.length)}</i></button>
              {categories.map((c) => <button type="button" key={c.slug} className={`akx-ck ${cat === c.slug ? "is-on" : ""}`} onClick={() => go(() => setCat(cat === c.slug ? "" : c.slug))}><span>{c.name}</span><i>{fa(all.filter((i) => i.categorySlug === c.slug).length)}</i></button>)}
            </div>
          ) : null}
          {sizes.length ? (
            <div className="akx-facet">
              <h4>{propStr(p, "sizeTitle", "اندازه")}</h4>
              {sizes.map((s) => <button type="button" key={s} className={`akx-ck ${size === s ? "is-on" : ""}`} onClick={() => go(() => setSize(size === s ? "" : s))}><span>{s}</span></button>)}
            </div>
          ) : null}
          <div className="akx-facet">
            <h4>{propStr(p, "statusTitle", "وضعیت")}</h4>
            <label className="akx-ck"><span>{propStr(p, "inStockLabel", "فقط موجود")}</span><input type="checkbox" checked={stock} onChange={(e) => go(() => setStock(e.target.checked))} /></label>
            <label className="akx-ck"><span>{propStr(p, "saleLabel", "تخفیف‌دار")}</span><input type="checkbox" checked={sale} onChange={(e) => go(() => setSale(e.target.checked))} /></label>
          </div>
        </FilterSide>
      ) : null}
      <div className="akx-main">
        <div className="akx-pills">{sorts.filter(([, l]) => l).map(([k, l]) => <button type="button" key={k} className={sort === k ? "is-on" : ""} onClick={() => go(() => setSort(k))}>{l}</button>)}</div>
        {anyDemo && propStr(p, "demoNotice") ? <p className="akx-notice" role="note">{propStr(p, "demoNotice")}</p> : null}
        {loading ? <div className="akx-grid-shop">{Array.from({ length: 4 }, (_, i) => <div key={i} className="akx-pr akx-skel" style={{ minHeight: 320 }} />)}</div> : null}
        {shown.length ? <div className="akx-grid-shop">{shown.map((it) => <ProductCard key={it.slug} p={p} it={it} />)}</div> : !loading ? <p className="akx-empty">محصولی یافت نشد.</p> : null}
        <Pager page={page} last={last} onPage={setPage} />
      </div>
    </section>
  )
}

/* ───────────── 7) product ───────────── */
export function PoetryProductWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const rt = useBuilderRuntime()
  const path = usePathname()
  const slug = propStr(p, "slug") || rt.productSlug || (path.startsWith("/product/") ? decodeURIComponent(path.slice(9).split("/")[0]) : "")
  const { items: catalog } = useCatalog(true, "per_page=60&sort=newest")
  const live = catalog?.find((x) => x.slug === slug)
  const shopItems = catalog?.map(fromProduct) ?? []
  const fallback: Item = { slug: slug || "manual", title: propStr(p, "name"), image: "", images: parseRows(p.images, ["src"]).map((r) => r.src).filter(Boolean), price: Number(toEn(propStr(p, "price")).replace(/[^\d]/g, "")) || 0, old: 0, href: "", category: propStr(p, "category"), categorySlug: "", size: "", demo: false, inStock: true, live: false, description: propStr(p, "description"), options: [] }
  fallback.image = fallback.images[0] ?? ""
  const it: Item = live ? fromProduct(live) : fallback
  if (live && !it.images.length) it.images = parseRows(p.images, ["src"]).map((r) => r.src).filter(Boolean)
  const [img, setImg] = useState(0)
  const opts = it.options.length ? it.options : propStr(p, "sizes").split(/[,،]/).map((s) => s.trim()).filter(Boolean)
  const colors = propStr(p, "frameColors").split(/[,،]/).map((s) => s.trim()).filter(Boolean)
  const [opt, setOpt] = useState(0)
  const [col, setCol] = useState(0)
  const [qty, setQty] = useState(1)
  const [fav, setFav] = useState(false)
  useEffect(() => { setFav(localStorage.getItem(`akx-wish:${it.slug}`) === "1") }, [it.slug])
  const variant = live?.variants[opt]
  const priced: Item = variant ? { ...it, price: variant.price || it.price, old: variant.compare && variant.compare > variant.price ? variant.compare : it.old, inStock: variant.inStock } : it
  const optionLabel = [opts[opt], colors[col]].filter(Boolean).join(" / ")
  const related = shopItems.filter((x) => x.slug !== it.slug && (!it.categorySlug || x.categorySlug === it.categorySlug)).slice(0, 4)
  const mode = propStr(p, "imageMode", "arabesque")
  if (catalog === null && slug) return <section className={`akx akx-pdwrap ${akxMfw(p)}`} dir="rtl" style={akxVars(p)}><div className="akx-pd akx-skel" style={{ minHeight: 480 }} /></section>
  return (
    <section className={`akx akx-pdwrap ${akxMfw(p)}`} dir="rtl" style={akxVars(p)}>
      <div className="akx-pd">
        <div className="akx-gal">
          <div className="akx-gal-main"><PhotoSlot mode={it.images[img] ? "photo" : mode} src={it.images[img]} logo={propStr(p, "logo")} alt={it.title} />{it.demo && propStr(p, "demoLabel") ? <span className="akx-demo">{propStr(p, "demoLabel")}</span> : null}</div>
          {it.images.length > 1 ? <div className="akx-thumbs">{it.images.slice(0, 5).map((s, i) => <button type="button" key={i} className={i === img ? "is-on" : ""} onClick={() => setImg(i)} aria-label={`تصویر ${fa(i + 1)}`}><img loading="lazy" decoding="async" {...optImg(s)} alt="" /></button>)}</div> : null}
        </div>
        <div className="akx-pd-info">
          {it.category ? <span className="akx-tag">{it.category}</span> : null}
          <h2>{it.title}</h2>
          <div className="akx-pd-price"><PriceLine p={p} it={priced} /></div>
          {it.description ? <p className="akx-pd-desc">{it.description.replace(/<[^>]+>/g, " ").slice(0, 600)}</p> : null}
          {opts.length ? <div className="akx-opt"><span>{propStr(p, "sizeLabel", "اندازه")}</span><div>{opts.map((o, i) => <button type="button" key={o} className={i === opt ? "is-on" : ""} aria-pressed={i === opt} onClick={() => setOpt(i)}>{o}</button>)}</div></div> : null}
          {colors.length ? <div className="akx-opt"><span>{propStr(p, "colorLabel", "رنگ قاب")}</span><div>{colors.map((o, i) => <button type="button" key={o} className={i === col ? "is-on" : ""} aria-pressed={i === col} onClick={() => setCol(i)}>{o}</button>)}</div></div> : null}
          <div className={`akx-stock ${priced.inStock ? "" : "is-out"}`}>{priced.inStock ? propStr(p, "stockLabel", "● موجود در انبار") : propStr(p, "outLabel", "● ناموجود")}</div>
          <div className="akx-buy">
            {propStr(p, "checkoutMode", "inquiry") === "cart" && priced.live ? <div className="akx-qty"><button type="button" onClick={() => setQty((q) => q + 1)} aria-label="افزایش">+</button><span>{fa(qty)}</span><button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="کاهش">−</button></div> : null}
            <BuyButton p={p} it={priced} qty={qty} big option={optionLabel} />
            <button type="button" className="akx-heart" aria-pressed={fav} aria-label="علاقه‌مندی" onClick={() => { const v = !fav; setFav(v); localStorage.setItem(`akx-wish:${it.slug}`, v ? "1" : "0") }}>{fav ? "♥" : "♡"}</button>
          </div>
          {propStr(p, "trustLine") ? <div className="akx-trust">{propStr(p, "trustLine")}</div> : null}
        </div>
      </div>
      {propBool(p, "showRelated", true) && related.length ? (
        <>
          <h3 className="akx-h3">{propStr(p, "relatedTitle", "محصولات مشابه")}</h3>
          <div className="akx-grid-shop" style={{ ["--akx-cols" as string]: "4" } as CSSProperties}>{related.map((r) => <ProductCard key={r.slug} p={p} it={r} />)}</div>
        </>
      ) : null}
    </section>
  )
}

/* ───────────── 8) poet profile (no photo by default) ───────────── */
export function PoetProfileWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const socials = socialsOf(p.socials)
  const info = propStr(p, "info").split("\n").map((s) => s.trim()).filter(Boolean)
  const paras = propStr(p, "story").split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)
  const tl = parseRows(p.timeline, ["value", "label"]).filter((r) => r.value || r.label)
  return (
    <section className={`akx akx-about ${akxMfw(p)}`} dir="rtl" style={akxVars(p)}>
      <div className="akx-abt">
        <div>
          <PhotoSlot mode={propStr(p, "photoMode", "logo")} src={propStr(p, "image")} logo={propStr(p, "logo")} alt={propStr(p, "name")} fallback="logo" className="akx-port" />
          <div className="akx-info">
            <h3>{propStr(p, "name")}</h3>
            {info.map((l, i) => <p key={i}>{l}</p>)}
            {socials.length ? <div className="akx-chips">{socials.map((s, i) => <a key={i} href={safeLink(s.href)} target="_blank" rel="noopener noreferrer" className="akx-tag">{SOCIAL_LABELS[s.network] ?? s.label ?? s.network}</a>)}</div> : null}
          </div>
        </div>
        <div className="akx-story">
          {propStr(p, "storyTitle") ? <h2>{propStr(p, "storyTitle")}</h2> : null}
          {paras.map((t, i) => (t.startsWith(">") ? <blockquote key={i}>{t.replace(/^>\s?/gm, "")}</blockquote> : <p key={i}>{t}</p>))}
        </div>
      </div>
      {tl.length ? <div className="akx-tl">{tl.map((r, i) => <div key={i}><b>{r.value}</b><span>{r.label}</span></div>)}</div> : null}
    </section>
  )
}

/* ───────────── 9) footer bar ───────────── */
export function PoetrySiteFooterWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const rt = useBuilderRuntime()
  const links = parseRows(p.links, ["label", "href"]).filter((l) => l.label)
  const socials = socialsOf(p.socials)
  const logo = propStr(p, "logo")
  return (
    <footer className={`akx akx-foot ${akxMfw(p)} ${footerExtraClass(p)}`} dir="rtl" style={{ ...akxVars(p, { bg: "--akx-fbg", text: "--akx-ftx" }), ...footerExtraStyle(p) }}>
      <div className="akx-foot-in">
        <Link href="/" className="akx-foot-brand">{logo ? <img loading="lazy" decoding="async" {...optImg(logo, undefined, true)} alt="" /> : null}<b>{propStr(p, "brand", rt.siteName ?? "")}</b></Link>
        <nav aria-label="پیوندهای پاورقی">{links.map((l, i) => <Link key={i} href={safeLink(l.href, "/")}>{l.label}</Link>)}</nav>
        <div className="akx-foot-soc">{socials.map((s, i) => <a key={i} href={safeLink(s.href)} target="_blank" rel="noopener noreferrer" aria-label={SOCIAL_LABELS[s.network] ?? s.network}>{s.label || SOCIAL_SHORT[s.network] || s.network}</a>)}</div>
      </div>
      <FooterExtras p={p} />
      {propStr(p, "copyright") ? <p className="akx-copy">{propStr(p, "copyright")}</p> : null}
    </footer>
  )
}
