"use client"

/* Generic poetry/content widgets (generic, config-driven, RTL, Persian digits, glass tone).
 *  - story-highlights : 9:16 (vertical) Instagram-story style carousel; videos play inline only after a tap (no autoplay);
 *                       optional leading "all poems in the book" card.
 *  - audio-playlist   : music-player style playlist (play/pause, prev/next, seek, volume, shuffle, repeat, download).
 *  - video-gallery    : clean video player + playlist.
 *  - media-split      : media-archive `mediaLayout: split` (audio playlist and video gallery in separate boxes).
 *  - occasion-grid    : live occasions index (for an /occasions page).
 * Premium items (is_premium / premium_locked from the API, or flags.is_premium on poems) show their name and info
 * but the content is blurred behind a CTA to the premium page (`premiumHref`, default /subscribe). */

import Link from "next/link"
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Download, Film, Music, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties, ReactNode } from "react"

import { parseRows, propBool, propNum, propStr } from "../props"
import { fromLive, fromRow, mediaPath, playable, usesLiveMedia, type LiveMedia, type MediaEntry } from "../poetry-media"
import type { WidgetNode } from "../types"
import { useBuilderRuntime } from "./runtime"
import { PhotoSlot, apiV1, usePoetryJson } from "./poetry-pages-widgets"
import { sectionBg, shell } from "./poetry-widgets"
import { JSON_HEADERS, PremiumBadge, PremiumVeil, hasLocked, loadMembership, mediaLocked, resetMembership, useMembership } from "./poetry-membership"
import { optImg } from "@/lib/image-url"
import "./poetry-v2.css"

type P = Record<string, unknown>
const FA = "۰۱۲۳۴۵۶۷۸۹"
export const fa = (v: string | number) => String(v).replace(/\d/g, (d) => FA[Number(d)])
const safe = (h: string, fb = "#") => { const v = (h || "").trim(); return v && /^(https?:|mailto:|tel:|\/|#|\?)/i.test(v) ? v : fb }
const inDashboard = () => typeof window !== "undefined" && /^\/dashboard(\/|$)/.test(window.location.pathname)
const VIDEO_RE = /\.(mp4|webm|mov|m3u8)(\?|#|$)/i

/** Shared surface classes (same `tone` contract as the other poetry widgets; default glass). */
export function v2Shell(p: P, extra: string): string {
  return shell(p, `wpv ${extra}`, "glass")
}

/** Section background + optional per-widget colour overrides (editable in the builder; empty = theme tokens). */
export function v2Style(p: P): CSSProperties {
  const v: Record<string, string> = { ...(sectionBg(p) as Record<string, string>) }
  const map: Array<[string, string[]]> = [["accentColor", ["--wpv-accent"]], ["highlightColor", ["--wpv-gold"]], ["textColor", ["--wpv-ink", "--wpz-ink"]], ["glassBg", ["--wpv-card", "--wpz-gcard"]], ["glassBorder", ["--wpv-line", "--wpz-gline"]]]
  for (const [key, vars] of map) {
    const c = propStr(p, key).trim()
    if (c && /^[#a-zA-Z0-9(),.%\s-]+$/.test(c)) for (const n of vars) v[n] = c
  }
  return v as CSSProperties
}

/** mm:ss in Persian digits. */
export function clock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return fa("00:00")
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  const mm = String(m).padStart(2, "0"), rr = String(r).padStart(2, "0")
  return fa(h ? `${h}:${mm}:${rr}` : `${mm}:${rr}`)
}

/* ───────────── generic public JSON (prefetch-aware; refetches with the session when SSR data was locked) ───────────── */
export function usePublicJson<T>(key: string | null): { data: T | null; meta: Record<string, number> | null; loading: boolean } {
  const pre = (useBuilderRuntime() as { prefetch?: Record<string, unknown> }).prefetch
  const seeded = key && pre && key in pre ? { data: pre[key] as T, meta: (pre[`${key}::meta`] as Record<string, number>) ?? null } : null
  const [st, setSt] = useState<{ data: T | null; meta: Record<string, number> | null; loading: boolean }>(() => (seeded ? { ...seeded, loading: false } : { data: null, meta: null, loading: !!key }))
  useEffect(() => {
    if (!key) return
    let off = false
    const run = () => fetch(apiV1(key.replace(/^\/v1\//, "")), { headers: JSON_HEADERS, credentials: "include" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((j: { data?: T; meta?: Record<string, number> }) => { if (!off) setSt({ data: (j.data ?? null) as T | null, meta: j.meta ?? null, loading: false }) })
      .catch(() => { if (!off) setSt({ data: null, meta: null, loading: false }) })
    if (!seeded) void run()
    else if (hasLocked(seeded.data)) void loadMembership().then((m) => { if (m.isMember && !off) void run() })
    return () => { off = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return st
}
export const HIGHLIGHTS_KEY = "/v1/public/poetry/highlights"
export const STORIES_KEY = "/v1/public/product-stories"
export const BOOKS_KEY = "/v1/public/poetry/books"
export const OCCASIONS_KEY = "/v1/public/poetry/occasions"

/* ═════════════ 1) story-highlights ═════════════ */
type Story = { title: string; subtitle: string; cover: string; video: string; embed: string; href: string; hrefLabel: string; duration: string; slides: number; locked: boolean }
type LiveStory = { title?: string; media_url?: string; media_type?: string; link_url?: string | null; slides?: Array<{ media_url?: string; media_type?: string; url?: string; type?: string }> | null }
type LiveHighlight = { id: number; title: string; kind: "image" | "video"; url: string | null; external_url: string | null; embed_url: string | null; cover: string | null; link_url: string | null; link_label: string | null; duration: string | null; is_premium?: boolean; locked?: boolean }

/** GET /v1/public/poetry/highlights rows → cards (video = tap-to-play; locked = title + blurred cover). */
export function storiesFromHighlights(rows: LiveHighlight[]): Story[] {
  return rows.map((h) => {
    const isVid = h.kind === "video"
    const file = h.url || ""
    return {
      title: h.title || "", subtitle: "", cover: h.cover || (isVid ? "" : file), video: isVid && (file || "") ? file : "",
      embed: isVid && !file ? h.embed_url || "" : "", href: h.link_url || (isVid ? "" : h.external_url || ""), hrefLabel: h.link_label || "",
      duration: h.duration || "", slides: 1, locked: !!h.locked,
    }
  }).filter((s) => s.locked || s.title || s.cover || s.video || s.embed)
}
/** Shop product stories (GET /v1/public/product-stories) as a fallback source. */
export function storiesFromLive(items: LiveStory[]): Story[] {
  return items.map((s) => {
    const slides = Array.isArray(s.slides) ? s.slides : []
    const vidSlide = slides.find((x) => (x.media_type ?? x.type) === "video" || VIDEO_RE.test(String(x.media_url ?? x.url ?? "")))
    const isVid = s.media_type === "video" || VIDEO_RE.test(s.media_url ?? "")
    const video = isVid ? s.media_url ?? "" : String(vidSlide?.media_url ?? vidSlide?.url ?? "")
    const imgSlide = slides.find((x) => (x.media_type ?? x.type) !== "video")
    const cover = !isVid ? s.media_url ?? "" : String(imgSlide?.media_url ?? imgSlide?.url ?? "")
    return { title: s.title ?? "", subtitle: "", cover, video, embed: "", href: s.link_url ?? "", hrefLabel: "", duration: "", slides: Math.max(1, slides.length || 1), locked: false }
  }).filter((s) => s.title || s.cover || s.video)
}

function StoryCard({ s, logo, label, p }: { s: Story; logo: string; label: string; p: P }) {
  const [playing, setPlaying] = useState(false)
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (playing) void ref.current?.play().catch(() => undefined) }, [playing])
  const head = (
    <div className="wpv-st-head">
      <div className="wpv-st-bars" aria-hidden>{Array.from({ length: Math.min(8, s.slides) }, (_, i) => <i key={i} />)}</div>
      <div className="wpv-st-who">
        <span className="wpv-st-av">{logo ? <img {...optImg(logo, "40px", true)} alt="" loading="lazy" decoding="async" /> : <BookOpen size={16} aria-hidden />}</span>
        <span className="wpv-st-name"><b>{s.title}</b>{s.subtitle ? <small>{s.subtitle}</small> : null}</span>
        {s.locked ? <PremiumBadge /> : null}
      </div>
    </div>
  )
  const cover = s.cover ? <img className="wpv-st-media" {...optImg(s.cover, "(max-width: 760px) 45vw, 240px")} alt="" loading="lazy" decoding="async" /> : null
  if (s.locked) {
    return (
      <article className="wpv-st wpv-st-locked" role="listitem">
        {cover ?? <PhotoSlot mode="arabesque" className="wpv-st-media" />}
        <span className="wpv-st-shade" aria-hidden />
        {head}
        <PremiumVeil p={p} compact />
      </article>
    )
  }
  if (s.video || s.embed) {
    return (
      <article className={`wpv-st ${playing ? "is-playing" : ""}`} role="listitem">
        {playing
          ? s.video
            ? <video ref={ref} className="wpv-st-media" src={s.video} poster={s.cover || undefined} controls playsInline preload="metadata" onEnded={() => setPlaying(false)} />
            : <iframe className="wpv-st-media" src={s.embed} title={s.title} allow="autoplay; fullscreen" allowFullScreen />
          : (<>
              {cover ?? (s.video ? <video className="wpv-st-media" src={`${s.video}#t=0.5`} preload="metadata" muted playsInline aria-hidden /> : <PhotoSlot mode="arabesque" className="wpv-st-media" />)}
              <span className="wpv-st-shade" aria-hidden />
              {head}
              <button type="button" className="wpv-st-play" onClick={() => setPlaying(true)} aria-label={`پخش ${s.title}`}><Play size={26} aria-hidden /></button>
              {s.duration ? <span className="wpv-vg-dur">{fa(s.duration)}</span> : null}
            </>)}
      </article>
    )
  }
  const href = safe(s.href, "")
  const body = (
    <>
      {cover ?? <PhotoSlot mode="arabesque" className="wpv-st-media" />}
      <span className="wpv-st-shade" aria-hidden />
      {head}
      {href ? <span className="wpv-st-go">{s.hrefLabel || label}<ArrowLeft size={14} aria-hidden /></span> : null}
    </>
  )
  return href && href !== "#" ? <Link href={href} className="wpv-st" role="listitem">{body}</Link> : <article className="wpv-st" role="listitem">{body}</article>
}

/** Snap track with the prev/next pill in the header row (top, next to the title) on every breakpoint. */
function Track({ p, label, head, children, spvD, spvM }: { p: P; label: string; head?: ReactNode; children: ReactNode; spvD: number; spvM: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState<{ start: boolean; end: boolean }>({ start: true, end: false })
  const upd = useCallback(() => {
    const el = ref.current
    if (!el) return
    const pos = Math.abs(el.scrollLeft), max = el.scrollWidth - el.clientWidth
    setEdge({ start: pos < 4, end: pos >= max - 4 })
  }, [])
  useEffect(() => { upd(); window.addEventListener("resize", upd); return () => window.removeEventListener("resize", upd) }, [upd, children])
  const step = (dir: 1 | -1) => {
    const el = ref.current
    if (!el) return
    const first = el.firstElementChild as HTMLElement | null
    const w = (first?.offsetWidth ?? el.clientWidth) + 14
    el.scrollBy({ left: -dir * w, behavior: "smooth" })
  }
  const arrows = propBool(p, "arrows", true) && !(edge.start && edge.end)
  return (
    <div className="wpv-track-wrap" role="region" aria-roledescription="carousel" aria-label={label}
      style={{ ["--wpv-spv" as string]: String(spvD), ["--wpv-spv-m" as string]: String(spvM) } as CSSProperties}>
      {head || arrows ? (
        <div className="wpz-chead">
          <div className="wpz-chead-main">{head}</div>
          {arrows ? (
            <div className="wpz-carrows">
              <button type="button" className="wpz-carrow" aria-label="قبلی" disabled={edge.start} onClick={() => step(-1)}><ChevronRight size={18} aria-hidden /></button>
              <button type="button" className="wpz-carrow" aria-label="بعدی" disabled={edge.end} onClick={() => step(1)}><ChevronLeft size={18} aria-hidden /></button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="wpv-track" ref={ref} role="list" onScroll={upd}>{children}</div>
    </div>
  )
}

type LiveBook = { id: number; slug: string; title: string; subtitle?: string | null; description?: string | null; cover?: string | null; purchase_url?: string | null; cta_label?: string | null; poems_count?: number; is_premium?: boolean; locked?: boolean }

export function StoryHighlightsWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const rt = useBuilderRuntime()
  const source = propStr(p, "source", "auto")
  const manual = parseRows(p.items, ["title", "cover", "video", "href", "subtitle"]).filter((r) => r.title || r.cover || r.video)
  const hl = usePublicJson<LiveHighlight[]>(source === "auto" || source === "highlights" ? HIGHLIGHTS_KEY : null)
  const hlRows = storiesFromHighlights(Array.isArray(hl.data) ? hl.data : [])
  // auto: poetry highlights; when the tenant has none yet, fall back to shop product stories.
  const st = usePublicJson<{ items?: LiveStory[] }>(source === "stories" || (source === "auto" && !hl.loading && !hlRows.length) ? STORIES_KEY : null)
  const limit = propNum(p, "limit", 0)
  let stories: Story[] = source === "manual"
    ? manual.map((r) => ({ title: r.title, subtitle: r.subtitle, cover: r.cover, video: r.video, embed: "", href: r.href, hrefLabel: "", duration: "", slides: 1, locked: false }))
    : hlRows.length ? hlRows : storiesFromLive(Array.isArray(st.data?.items) ? st.data!.items : [])
  if (limit > 0) stories = stories.slice(0, limit)
  const bookOn = propBool(p, "bookCard", true)
  const books = usePublicJson<LiveBook[]>(bookOn ? BOOKS_KEY : null)
  const wantSlug = propStr(p, "bookSlug").trim()
  const bookList = Array.isArray(books.data) ? books.data : []
  const book = bookList.find((b) => b.slug === wantSlug) ?? bookList[0] ?? null
  const poems = usePoetryJson<unknown[]>(bookOn && !book ? "poems?per_page=1" : null)
  const total = book?.poems_count ?? poems.meta?.total ?? 0
  const logo = propStr(p, "logo") || rt.logoUrl || ""
  const goLabel = propStr(p, "openLabel", "مشاهده")
  if (!stories.length && !bookOn) return inDashboard() ? <section className={v2Shell(p, "wpv-hl")} dir="rtl" style={v2Style(p)}><p className="wpz-empty">هنوز هایلایتی ثبت نشده است.</p></section> : null
  // Card link: explicit bookHref > book page template > the book's buy link > all poems.
  const tpl = propStr(p, "bookHref")
  const bookHref = safe(tpl ? tpl.replace("{slug}", encodeURIComponent(book?.slug ?? "")) : book?.purchase_url || "/poems", "/poems")
  const bookCover = propStr(p, "bookCover") || book?.cover || ""
  const sub = propStr(p, "bookSubtitle") || book?.subtitle || (total ? `${fa(total)} شعر` : "")
  return (
    <section className={v2Shell(p, "wpv-hl")} dir="rtl" style={v2Style(p)}>
      <Track p={p} head={propStr(p, "title") ? <h2 className="wpz-h2">{propStr(p, "title")}</h2> : null} label={propStr(p, "title") || "هایلایت‌ها"} spvD={Math.max(1, Math.min(8, propNum(p, "slidesDesktop", 5)))} spvM={Math.max(1, Math.min(4, propNum(p, "slidesMobile", 2.4)))}>
        {bookOn ? (
          <Link href={bookHref} className="wpv-st wpv-st-book" role="listitem">
            {bookCover
              ? <img className="wpv-st-media" {...optImg(bookCover, "(max-width: 760px) 45vw, 240px")} alt="" loading="lazy" decoding="async" />
              : <PhotoSlot mode="arabesque" className="wpv-st-media" />}
            <span className="wpv-st-shade" aria-hidden />
            <div className="wpv-book-body">
              <span className="wpv-book-ic">{logo && !bookCover ? <img {...optImg(logo, "46px", true)} alt="" /> : <BookOpen size={22} aria-hidden />}</span>
              <b>{propStr(p, "bookTitle") || book?.title || "مجموعه همه اشعار در کتاب"}</b>
              {sub ? <small>{sub}</small> : null}
              <span className="wpv-st-go">{propStr(p, "bookLabel") || book?.cta_label || "مشاهده همه اشعار"}<ArrowLeft size={14} aria-hidden /></span>
            </div>
          </Link>
        ) : null}
        {stories.map((s, i) => <StoryCard key={i} s={s} logo={logo} label={goLabel} p={p} />)}
      </Track>
    </section>
  )
}

/* ═════════════ media source shared by playlist + gallery ═════════════ */
function useMediaEntries(p: P, kind: "audio" | "video", limit: number, entries?: MediaEntry[]): { items: MediaEntry[]; loading: boolean } {
  const live = !entries && usesLiveMedia(p.source)
  const { data, loading } = usePublicJson<LiveMedia[]>(live ? `/v1/public/poetry/${mediaPath(limit, kind)}` : null)
  const items = useMemo(() => {
    const all = entries ? entries : live
      ? playable((Array.isArray(data) ? data : []).map(fromLive))
      : playable(parseRows(p.items, ["title", "src", "cover", "reciter", "duration", "kind", "premium"]).map((r) => {
          const e = fromRow({ ...r, kind: r.kind || kind })
          return e ? { ...e, premium: r.premium === "1" || r.premium === "true" } : null
        }))
    const occ = propStr(p, "occasion").trim()
    return all.filter((m) => m.kind === kind && (!occ || m.tag === occ))
  }, [data, live, p, kind, entries])
  return { items, loading }
}

type DlResult = { ok: true; url: string; remaining: number | null } | { ok: false; reason: "login" | "premium" | "quota" | "error" } | { ok: "fallback" }
/** GET /v1/account/membership/media/{id}/download?mode=json (session). 403 premium_required | download_quota_exceeded. */
async function requestDownload(m: MediaEntry): Promise<DlResult> {
  if (!m.id) return { ok: "fallback" }
  try {
    const r = await fetch(apiV1(`account/membership/media/${m.id}/download?mode=json`), { credentials: "include", headers: JSON_HEADERS })
    if (r.status === 401) return { ok: false, reason: "login" }
    if (r.status === 404 || r.status === 405) return { ok: "fallback" }
    const j = (await r.json().catch(() => ({}))) as { data?: { url?: string | null; code?: string; remaining?: number | null } }
    if (r.status === 403) return { ok: false, reason: j.data?.code === "premium_required" ? "premium" : "quota" }
    if (!r.ok || !j.data?.url) return { ok: false, reason: "error" }
    return { ok: true, url: j.data.url, remaining: typeof j.data.remaining === "number" ? j.data.remaining : null }
  } catch { return { ok: false, reason: "error" } }
}
function triggerDownload(url: string, name: string) {
  const a = document.createElement("a")
  a.href = url; a.download = name || ""; a.rel = "noopener"
  document.body.appendChild(a); a.click(); a.remove()
}

/* ═════════════ 2) audio-playlist ═════════════ */
type Repeat = "off" | "all" | "one"
export function AudioPlaylistWidget({ widget }: { widget: WidgetNode }) {
  return <AudioPlaylist p={widget.props} id={widget.id} />
}
export function AudioPlaylist({ p, id, embedded = false, entries }: { p: P; id: string; embedded?: boolean; entries?: MediaEntry[] }) {
  const { items, loading } = useMediaEntries(p, "audio", Math.min(60, Math.max(1, propNum(p, "count", 30))), entries)
  const member = useMembership()
  const audio = useRef<HTMLAudioElement>(null)
  const [cur, setCur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)
  const [vol, setVol] = useState(1)
  const [muted, setMuted] = useState(false)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState<Repeat>("off")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(-1)
  const track = items[cur]
  const locked = track ? mediaLocked(track) : false
  const flash = (s: string) => { setNote(s); window.setTimeout(() => setNote(""), 3200) }

  const load = useCallback((i: number, autoplay: boolean) => {
    setCur(i); setT(0); setDur(0)
    const a = audio.current, m = items[i]
    if (!a || !m) return
    if (mediaLocked(m) || !m.src) { a.pause(); a.removeAttribute("src"); setPlaying(false); return }
    a.src = m.src
    if (autoplay) void a.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
  }, [items])

  const nextIndex = useCallback((dir: 1 | -1) => {
    if (!items.length) return 0
    if (shuffle && items.length > 1) { let n = cur; while (n === cur) n = Math.floor(Math.random() * items.length); return n }
    return (cur + dir + items.length) % items.length
  }, [cur, items.length, shuffle])

  const toggle = () => {
    const a = audio.current
    if (!a || !track || locked) return
    if (!a.src) { load(cur, true); return }
    if (a.paused) void a.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    else { a.pause(); setPlaying(false) }
  }
  const onEnded = () => {
    if (repeat === "one") { const a = audio.current; if (a) { a.currentTime = 0; void a.play() } return }
    if (repeat === "off" && !shuffle && cur === items.length - 1) { setPlaying(false); return }
    load(nextIndex(1), true)
  }
  useEffect(() => { const a = audio.current; if (a) { a.volume = vol; a.muted = muted } }, [vol, muted])
  useEffect(() => {
    if (!track || typeof navigator === "undefined" || !("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return
    navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.reciter || "", artwork: track.cover ? [{ src: track.cover }] : [] })
  }, [track])

  const [remaining, setRemaining] = useState<number | null>(null)
  const left = remaining ?? member.remaining
  const download = async (i: number) => {
    const m = items[i]
    if (!m) return
    if (mediaLocked(m)) { flash("دانلود این صوت ویژه اعضای اشتراک است."); return }
    setBusy(i)
    const r = await requestDownload(m)
    setBusy(-1)
    if (r.ok === true) { triggerDownload(r.url, m.title); if (r.remaining !== null) setRemaining(r.remaining); resetMembership() }
    else if (r.ok === "fallback") { if (m.src) triggerDownload(m.src, m.title); else flash("فایلی برای دانلود نیست.") }
    else if (r.reason === "login") window.location.assign(`${safe(propStr(p, "loginHref", "/login"), "/login")}?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)
    else flash(r.reason === "quota" ? propStr(p, "limitText", "سقف دانلود رایگان تمام شده است. برای دانلود نامحدود اشتراک ویژه تهیه کنید.") : r.reason === "premium" ? "دانلود این صوت ویژه اعضای اشتراک است." : "دانلود ممکن نشد؛ دوباره تلاش کنید.")
  }

  if (!items.length) {
    if (loading) return embedded ? null : <section className={v2Shell(p, "wpv-ap")} dir="rtl" style={v2Style(p)}><div className="wpv-ap-skel" /></section>
    const empty = <p className="wpv-empty"><Music size={20} aria-hidden />{propStr(p, "emptyText", "هنوز صوتی منتشر نشده است.")}</p>
    if (embedded) return <div className="wpv-block wpv-ap">{empty}</div>
    return propBool(p, "hideWhenEmpty", false) && !inDashboard() ? null : <section className={v2Shell(p, "wpv-ap")} dir="rtl" style={v2Style(p)}>{propStr(p, "title") ? <h2 className="wpz-h2">{propStr(p, "title")}</h2> : null}{empty}</section>
  }
  const showDl = propBool(p, "showDownload", true)
  const pct = dur ? Math.min(100, (t / dur) * 100) : 0
  const RepIcon = repeat === "one" ? Repeat1 : Repeat
  const body = (
    <div className="wpv-ap-grid">
      <div className="wpv-ap-player">
        <div className={`wpv-ap-cover ${playing ? "is-on" : ""}`}>
          <PhotoSlot mode={track?.cover ? "photo" : "logo"} src={track?.cover} logo={propStr(p, "logo")} alt={track?.title} />
          {locked ? <PremiumVeil p={p} compact /> : null}
        </div>
        <div className="wpv-ap-meta">
          <b>{track?.title}</b>
          <small>{[track?.reciter, track?.tag].filter(Boolean).join(" · ")}</small>
          {track?.premium ? <PremiumBadge /> : null}
        </div>
        <div className="wpv-ap-seek">
          <input type="range" min={0} max={dur || 0} step={0.5} value={t} disabled={!dur || locked} aria-label="جابه‌جایی در صوت"
            style={{ ["--wpv-pct" as string]: `${pct}%` } as CSSProperties}
            onChange={(e) => { const a = audio.current; if (a) { a.currentTime = Number(e.target.value); setT(Number(e.target.value)) } }} />
          <div className="wpv-ap-times"><span>{clock(t)}</span><span>{dur ? clock(dur) : fa(track?.duration || "00:00")}</span></div>
        </div>
        <div className="wpv-ap-ctrl">
          <button type="button" className={`wpv-ic ${shuffle ? "is-on" : ""}`} aria-pressed={shuffle} aria-label="پخش تصادفی" onClick={() => setShuffle((v) => !v)}><Shuffle size={18} aria-hidden /></button>
          <button type="button" className="wpv-ic" aria-label="قبلی" onClick={() => load(nextIndex(-1), playing)}><SkipForward size={20} aria-hidden /></button>
          <button type="button" className="wpv-ap-main" aria-label={playing ? "توقف" : "پخش"} onClick={toggle} disabled={locked}>{playing ? <Pause size={26} aria-hidden /> : <Play size={26} aria-hidden />}</button>
          <button type="button" className="wpv-ic" aria-label="بعدی" onClick={() => load(nextIndex(1), playing)}><SkipBack size={20} aria-hidden /></button>
          <button type="button" className={`wpv-ic ${repeat !== "off" ? "is-on" : ""}`} aria-label={repeat === "one" ? "تکرار همین صوت" : repeat === "all" ? "تکرار همه" : "بدون تکرار"} onClick={() => setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"))}><RepIcon size={18} aria-hidden /></button>
        </div>
        <div className="wpv-ap-vol">
          <button type="button" className="wpv-ic" aria-label={muted ? "صدا روشن" : "بی‌صدا"} onClick={() => setMuted((v) => !v)}>{muted || vol === 0 ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}</button>
          <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : vol} aria-label="بلندی صدا" style={{ ["--wpv-pct" as string]: `${(muted ? 0 : vol) * 100}%` } as CSSProperties} onChange={(e) => { setVol(Number(e.target.value)); setMuted(false) }} />
          {showDl ? <button type="button" className="wpv-chip" onClick={() => void download(cur)} disabled={busy === cur}><Download size={15} aria-hidden />{propStr(p, "downloadLabel", "دانلود")}</button> : null}
        </div>
        {showDl && member.loggedIn && !member.unlimited && left !== null ? <p className="wpv-ap-quota">{`دانلود رایگان باقی‌مانده: ${fa(left)} صوت`}</p> : null}
        {showDl && member.known && !member.loggedIn && member.freeDownloads ? <p className="wpv-ap-quota">{`با ورود به حساب، ${fa(member.freeDownloads)} صوت را رایگان دانلود کنید.`}</p> : null}
        {note ? <p className="wpv-note" role="status">{note}</p> : null}
      </div>
      <ol className="wpv-ap-list" aria-label="فهرست پخش">
        {items.map((m, i) => {
          const lk = mediaLocked(m)
          return (
            <li key={`${m.id ?? i}`} className={`${i === cur ? "is-cur" : ""} ${lk ? "is-locked" : ""}`}>
              <button type="button" className="wpv-ap-row" onClick={() => (i === cur ? toggle() : load(i, true))} aria-current={i === cur ? "true" : undefined}>
                <span className="wpv-ap-n">{i === cur && playing ? <span className="wpv-eq" aria-hidden><i /><i /><i /></span> : fa(String(i + 1).padStart(2, "0"))}</span>
                <span className="wpv-ap-t"><b>{m.title}</b><small>{m.reciter}</small></span>
                {lk ? <PremiumBadge /> : null}
                <span className="wpv-ap-d">{m.duration ? fa(m.duration) : ""}</span>
              </button>
              {showDl && !lk ? <button type="button" className="wpv-ic wpv-ap-dl" aria-label={`دانلود ${m.title}`} disabled={busy === i} onClick={() => void download(i)}><Download size={16} aria-hidden /></button> : null}
            </li>
          )
        })}
      </ol>
      <audio ref={audio} preload="none" onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onLoadedMetadata={(e) => setDur(e.currentTarget.duration)} onEnded={onEnded} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />
    </div>
  )
  if (embedded) return <div className="wpv-block wpv-ap" id={`wpv-ap-${id}`}>{body}</div>
  return (
    <section className={v2Shell(p, "wpv-ap")} dir="rtl" style={v2Style(p)} id={`wpv-ap-${id}`}>
      <div className="wpz-head">
        {propStr(p, "title") ? <h2 className="wpz-h2">{propStr(p, "title")}</h2> : null}
        {propStr(p, "moreLabel") ? <Link className="wpz-more" href={safe(propStr(p, "moreHref"), "/media")}>{propStr(p, "moreLabel")} <ArrowLeft className="h-4 w-4" aria-hidden /></Link> : null}
      </div>
      {body}
    </section>
  )
}

/* ═════════════ 3) video-gallery ═════════════ */
export function VideoGalleryWidget({ widget }: { widget: WidgetNode }) {
  return <VideoGallery p={widget.props} id={widget.id} />
}
export function VideoGallery({ p, id, embedded = false, entries }: { p: P; id: string; embedded?: boolean; entries?: MediaEntry[] }) {
  const { items, loading } = useMediaEntries(p, "video", Math.min(60, Math.max(1, propNum(p, "count", 24))), entries)
  const [cur, setCur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (playing) void ref.current?.play().catch(() => undefined) }, [playing, cur])
  const v = items[cur]
  const locked = v ? mediaLocked(v) : false
  if (!items.length) {
    if (loading) return null
    const empty = <p className="wpv-empty"><Film size={20} aria-hidden />{propStr(p, "emptyText", "هنوز ویدیویی منتشر نشده است.")}</p>
    if (embedded) return <div className="wpv-block wpv-vg">{empty}</div>
    return propBool(p, "hideWhenEmpty", false) && !inDashboard() ? null : <section className={v2Shell(p, "wpv-vg")} dir="rtl" style={v2Style(p)}>{propStr(p, "title") ? <h2 className="wpz-h2">{propStr(p, "title")}</h2> : null}{empty}</section>
  }
  const pick = (i: number) => { setCur(i); setPlaying(!mediaLocked(items[i])) }
  const body = (
    <div className={`wpv-vg-grid ${items.length > 1 ? "" : "wpv-vg-solo"}`}>
      <div className="wpv-vg-stage">
        <div className="wpv-vg-screen">
          {locked ? (<>{v.cover ? <img className="wpv-vg-poster" {...optImg(v.cover, "(max-width: 760px) 100vw, 800px")} alt="" /> : <PhotoSlot mode="logo" logo={propStr(p, "logo")} />}<PremiumVeil p={p} /></>)
            : playing && v.src ? <video key={v.src} ref={ref} src={v.src} poster={v.cover || undefined} controls playsInline preload="metadata" />
            : playing && v.embed ? <iframe src={v.embed} title={v.title} allowFullScreen loading="lazy" />
            : (
              <button type="button" className="wpv-vg-cover" onClick={() => (v.src || v.embed ? setPlaying(true) : v.link && window.open(v.link, "_blank", "noopener"))} aria-label={`پخش ${v.title}`}>
                {v.cover ? <img className="wpv-vg-poster" {...optImg(v.cover, "(max-width: 760px) 100vw, 800px")} alt="" /> : <PhotoSlot mode="logo" logo={propStr(p, "logo")} />}
                <span className="wpv-vg-big"><Play size={34} aria-hidden /></span>
                {v.duration ? <span className="wpv-vg-dur">{fa(v.duration)}</span> : null}
              </button>
            )}
        </div>
        <div className="wpv-vg-cap"><b>{v.title}</b><small>{[v.reciter, v.tag, v.poem].filter(Boolean).join(" · ")}</small>{v.premium ? <PremiumBadge /> : null}</div>
      </div>
      {items.length > 1 ? (
        <ol className="wpv-vg-list" aria-label="فهرست ویدیوها">
          {items.map((m, i) => (
            <li key={`${m.id ?? i}`}>
              <button type="button" className={`wpv-vg-item ${i === cur ? "is-cur" : ""}`} onClick={() => pick(i)} aria-current={i === cur ? "true" : undefined}>
                <span className="wpv-vg-th">{m.cover ? <img {...optImg(m.cover, "160px")} alt="" loading="lazy" decoding="async" /> : <PhotoSlot mode="arabesque" />}<Play size={16} aria-hidden />{m.duration ? <em>{fa(m.duration)}</em> : null}</span>
                <span className="wpv-vg-it"><b>{m.title}</b><small>{m.reciter}</small>{mediaLocked(m) ? <PremiumBadge /> : null}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
  if (embedded) return <div className="wpv-block wpv-vg" id={`wpv-vg-${id}`}>{body}</div>
  return (
    <section className={v2Shell(p, "wpv-vg")} dir="rtl" style={v2Style(p)} id={`wpv-vg-${id}`}>
      <div className="wpz-head">{propStr(p, "title") ? <h2 className="wpz-h2">{propStr(p, "title")}</h2> : null}</div>
      {body}
    </section>
  )
}

/* ═════════════ 4) media-archive `mediaLayout: split` ═════════════ */
export function MediaSplitWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const audioP = { ...p, title: "", count: 60 }
  return (
    <section className={v2Shell(p, "wpv-split")} dir="rtl" style={v2Style(p)}>
      <div className="wpv-split-box">
        <div className="wpv-split-head"><span className="wpv-split-ic"><Music size={18} aria-hidden /></span><h2 className="wpz-h2">{propStr(p, "audioTitle", "صوت‌ها")}</h2></div>
        <AudioPlaylist p={audioP} id={`${widget.id}-a`} embedded />
      </div>
      <div className="wpv-split-box">
        <div className="wpv-split-head"><span className="wpv-split-ic"><Film size={18} aria-hidden /></span><h2 className="wpz-h2">{propStr(p, "videoTitle", "ویدیوها")}</h2></div>
        <VideoGallery p={{ ...p, title: "", count: 60 }} id={`${widget.id}-v`} embedded />
      </div>
    </section>
  )
}

/* ═════════════ 5) occasion-grid (+ inline occasion page) ═════════════
 * Index: GET /v1/public/poetry/occasions (poems_count, media_count). With `?occasion=<slug>` on the same page
 * (default detailHref) it shows that occasion: GET /v1/public/poetry/occasions/{slug} → { occasion, poems[], media[] }. */
type Occasion = { id: number; kind: string; slug: string; name: string; image?: string | null; description?: string | null; poems_count?: number; media_count?: number }
type OccCard = { id: number; slug: string; title: string; excerpt?: string | null; style_label?: string | null; styles?: { name: string }[]; is_premium?: boolean; locked?: boolean; line_count?: number }
type OccDetail = { occasion: Occasion; poems: OccCard[]; media: LiveMedia[] }

export function useUrlQuery(name: string): string {
  const rt = useBuilderRuntime()
  const [v, setV] = useState(rt.query?.[name] ?? "")
  useEffect(() => { setV(new URLSearchParams(window.location.search).get(name) ?? "") }, [name])
  return v
}

export function OccasionGridWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const tpl = propStr(p, "detailHref", "/occasions?occasion={slug}")
  const inline = propBool(p, "inlineDetail", true)
  const slug = useUrlQuery("occasion").trim()
  if (inline && slug) return <OccasionDetail p={p} slug={slug} />
  return <OccasionIndex p={p} tpl={tpl} />
}

function OccasionIndex({ p, tpl }: { p: P; tpl: string }) {
  const { data, loading } = usePublicJson<Occasion[]>(OCCASIONS_KEY)
  const showEmpty = propBool(p, "showEmpty", false)
  const list = (Array.isArray(data) ? data : []).filter((t) => showEmpty || (t.poems_count ?? 0) + (t.media_count ?? 0) > 0)
  if (!list.length && !loading && !inDashboard()) return <section className={v2Shell(p, "wpv-occ")} dir="rtl" style={v2Style(p)}><p className="wpv-empty">{propStr(p, "emptyText", "هنوز مناسبتی ثبت نشده است.")}</p></section>
  return (
    <section className={v2Shell(p, "wpv-occ")} dir="rtl" style={v2Style(p)}>
      {propStr(p, "title") ? <div className="wpz-head"><h2 className="wpz-h2">{propStr(p, "title")}</h2></div> : null}
      {propStr(p, "text") ? <p className="wpv-lead">{propStr(p, "text")}</p> : null}
      <div className="wpv-occ-grid" style={{ ["--wpv-cols" as string]: String(Math.max(2, Math.min(5, propNum(p, "columns", 4)))) } as CSSProperties}>
        {loading && !list.length ? Array.from({ length: 4 }, (_, i) => <span key={i} className="wpv-occ-card wpv-skel" />) : null}
        {list.map((t) => {
          const n = t.poems_count ?? 0, m = t.media_count ?? 0
          const meta = [n ? `${fa(n)} شعر` : "", m ? `${fa(m)} اجرا` : ""].filter(Boolean).join(" · ") || "به‌زودی"
          return (
            <Link key={t.id} href={safe(tpl.replace("{slug}", encodeURIComponent(t.slug)), "/poems")} className="wpv-occ-card">
              {t.image ? <img {...optImg(t.image, "(max-width: 760px) 50vw, 300px")} alt="" loading="lazy" decoding="async" /> : <PhotoSlot mode="arabesque" />}
              <span className="wpv-st-shade" aria-hidden />
              <span className="wpv-occ-body"><b>{t.name}</b><small>{meta}</small></span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function OccasionDetail({ p, slug }: { p: P; slug: string }) {
  const { data, loading } = usePublicJson<OccDetail>(`${OCCASIONS_KEY}/${encodeURIComponent(slug)}`)
  const backHref = safe(propStr(p, "backHref", "/occasions"), "/occasions")
  const detail = propStr(p, "poemHref", "/poem?poem={slug}")
  const media = useMemo(() => playable((data?.media ?? []).map(fromLive)), [data])
  const audio = media.filter((m) => m.kind === "audio"), video = media.filter((m) => m.kind === "video")
  if (loading && !data) return <section className={v2Shell(p, "wpv-occ")} dir="rtl" style={v2Style(p)}><div className="wpv-ap-skel" /></section>
  if (!data?.occasion) return <section className={v2Shell(p, "wpv-occ")} dir="rtl" style={v2Style(p)}><p className="wpv-empty">این مناسبت یافت نشد.</p><Link className="wpz-more" href={backHref}>همه مناسبت‌ها <ArrowLeft className="h-4 w-4" aria-hidden /></Link></section>
  const o = data.occasion
  return (
    <section className={v2Shell(p, "wpv-occ wpv-occd")} dir="rtl" style={v2Style(p)}>
      <header className="wpv-occd-hero">
        <div className="wpv-occd-img">{o.image ? <img {...optImg(o.image, "(max-width: 760px) 100vw, 360px", true)} alt="" /> : <PhotoSlot mode="arabesque" />}</div>
        <div className="wpv-occd-txt">
          <Link className="wpv-occd-back" href={backHref}><ArrowLeft size={14} style={{ transform: "scaleX(-1)" }} aria-hidden />همه مناسبت‌ها</Link>
          <h1 className="wpz-h2">{o.name}</h1>
          {o.description ? <p className="wpv-lead">{o.description}</p> : null}
          <small>{[data.poems.length ? `${fa(data.poems.length)} شعر` : "", media.length ? `${fa(media.length)} اجرا` : ""].filter(Boolean).join(" · ")}</small>
        </div>
      </header>
      {data.poems.length ? (
        <div className="wpv-occd-poems">
          {data.poems.map((c) => (
            <Link key={c.id} href={poemLinkOf(detail, c.slug)} className={`wpv-occd-poem ${c.locked ? "is-locked" : ""}`}>
              <b>{c.title}</b>
              {c.locked ? <span className="wpv-occd-lock"><PremiumBadge />{c.line_count ? <small>{`${fa(c.line_count)} مصراع`}</small> : null}</span> : c.excerpt ? <small>{c.excerpt}</small> : <small>{c.style_label || c.styles?.[0]?.name || ""}</small>}
            </Link>
          ))}
        </div>
      ) : <p className="wpv-empty">هنوز شعری برای این مناسبت منتشر نشده است.</p>}
      {audio.length ? <div className="wpv-occd-media"><h3 className="wpv-occd-h3"><Music size={18} aria-hidden />صوت‌ها</h3><AudioPlaylist p={{ ...p, title: "" }} id={`occ-${o.id}-a`} embedded entries={audio} /></div> : null}
      {video.length ? <div className="wpv-occd-media"><h3 className="wpv-occd-h3"><Film size={18} aria-hidden />ویدیوها</h3><VideoGallery p={{ ...p, title: "" }} id={`occ-${o.id}-v`} embedded entries={video} /></div> : null}
    </section>
  )
}
const poemLinkOf = (tpl: string, slug: string) => (/\{slug\}/.test(tpl) ? tpl.replace(/\{slug\}/g, encodeURIComponent(slug)) : `${tpl}${tpl.includes("?") ? "&" : "?"}poem=${encodeURIComponent(slug)}`)
