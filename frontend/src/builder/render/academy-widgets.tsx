"use client"

/* Premium academy widgets — tones: blush (Sanaz/Gatabi), ocean (English Bridge), light, ink. */

import { PriceOrText } from "../money"
import Link from "next/link"
import { useEffect, useState, type CSSProperties } from "react"

import { parseRows, propBool, propNum, propStr } from "../props"
import type { WidgetNode } from "../types"
import { Img } from "./img"
import "./academy-widgets.css"

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

function shell(p: Record<string, unknown>, extra = "") {
  const tone = propStr(p, "tone", "light")
  const toneCls =
    tone === "blush"
      ? "wax-blush"
      : tone === "ocean"
        ? "wax-ocean"
        : tone === "ocean-deep"
          ? "wax-ocean-deep"
          : tone === "ink"
            ? "wax-ink"
            : tone === "chalk"
              ? "wax-chalk"
              : tone === "transparent"
                ? "wax-clear"
                : "wax-light"
  const bg = propStr(p, "bgImage") ? "wax-has-bg" : ""
  const bleed = propBool(p, "fullBleed", false) ? "wax-bleed" : ""
  const motion = propBool(p, "motion", false) ? "wax-motion" : ""
  const mfw = propBool(p, "mobileFullWidth", true) ? "wax-mfw" : ""
  const dashed = propStr(p, "ctaStyle", "default") === "dashed-book" ? "wax-dashed-book" : ""
  return `wax wax-pad ${toneCls} ${bg} ${bleed} ${motion} ${mfw} ${dashed} ${extra}`.trim()
}

function chalkTitle(title: string, accent: string) {
  if (!title && !accent) return null
  if (!accent) return title
  // Accent may sit mid-title: if title already contains accent, wrap that span; else append.
  if (title.includes(accent)) {
    const parts = title.split(accent)
    return (
      <>
        {parts[0]}
        <em className="wax-accent-em">{accent}</em>
        {parts.slice(1).join(accent)}
      </>
    )
  }
  return (
    <>
      {title}
      {title ? " " : ""}
      <em className="wax-accent-em">{accent}</em>
    </>
  )
}

function sectionBg(p: Record<string, unknown>): CSSProperties {
  const img = propStr(p, "bgImage").replace(/["\\()]/g, "")
  const ov = propStr(p, "bgOverlay")
  const op = Math.max(0, Math.min(100, propNum(p, "bgOverlayOpacity", 55)))
  const v: Record<string, string> = {}
  if (img && /^(https?:\/\/|\/)/.test(img)) v["--wax-bg-img"] = `url("${img}")`
  if (ov && CSS_SAFE.test(ov)) v["--wax-ov"] = ov
  v["--wax-ov-op"] = String(op / 100)
  return v as CSSProperties
}

function Head({ title, subtitle, accent = "" }: { title: string; subtitle: string; accent?: string }) {
  if (!title && !subtitle && !accent) return null
  return (
    <header className="wax-section-head wax-rise">
      {title || accent ? <h2>{chalkTitle(title, accent)}</h2> : null}
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  )
}

type CourseRow = { title: string; level: string; meta: string; price: string; image: string; href: string; badge: string; tint?: string; desc?: string; slug?: string }

function useAcademyCourses(enabled: boolean, count: number) {
  const [rows, setRows] = useState<CourseRow[] | null>(null)
  useEffect(() => {
    if (!enabled) return
    let dead = false
    ;(async () => {
      const ac = new AbortController()
      const timer = window.setTimeout(() => ac.abort(), 12000)
      try {
        const res = await fetch(`/api/v1/public/academy?per_page=${count}`, {
          credentials: "same-origin",
          signal: ac.signal,
          headers: { Accept: "application/json" },
        })
        type LiveCourse = { title?: string; slug?: string; description?: string; cover_url?: string; level?: string; price_minor?: number }
        const json = (await res.json()) as { data?: LiveCourse[] | { items?: LiveCourse[] }; items?: LiveCourse[] }
        if (dead) return
        if (!res.ok) { setRows([]); return }
        const d = json?.data
        const list: LiveCourse[] = Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : Array.isArray(json?.items) ? json.items : []
        setRows(
          list.slice(0, count).map((c) => ({
            title: String(c.title || ""),
            level: String(c.level || ""),
            meta: "",
            price: typeof c.price_minor === "number" && c.price_minor > 0 ? String(Math.round(c.price_minor / 10)) : "",
            image: String(c.cover_url || ""),
            href: c.slug ? `/academy/${c.slug}` : "/academy",
            badge: "",
            slug: c.slug,
          })),
        )
      } catch {
        if (!dead) setRows([])
      } finally {
        window.clearTimeout(timer)
      }
    })()
    return () => {
      dead = true
    }
  }, [enabled, count])
  return rows
}

export function AcademyHeroWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const image = safeMedia(propStr(p, "image"))
  const requested = propStr(p, "layout", "split")
  // Without a portrait, split leaves a dead half-viewport — fall back to centered full-bleed copy.
  const layout = requested === "split" && !image ? "centered" : requested
  const stats = parseRows(p.stats, ["value", "label"]).filter((r) => r.value || r.label)
  const chalk = propStr(p, "tone", "light") === "chalk"
  const frame = propStr(p, "frame", chalk ? "blob" : "rect")
  const floatA = propStr(p, "floatA")
  const floatB = propStr(p, "floatB")
  const titleAccent = propStr(p, "titleAccent")
  return (
    <section className={shell(p, "wax-hero")} style={sectionBg(p)}>
      <div className={`wax-hero-grid ${layout}`}>
        <div className={`wax-copy wax-rise${chalk ? " wax-hero-card" : ""}`}>
          {propStr(p, "eyebrow") ? <div className="wax-eyebrow">{propStr(p, "eyebrow")}</div> : null}
          {propStr(p, "title") || titleAccent ? <h1 className="wax-title">{chalkTitle(propStr(p, "title"), titleAccent)}</h1> : null}
          {propStr(p, "text") ? <p className="wax-text">{propStr(p, "text")}</p> : null}
          <div className="wax-actions">
            {propStr(p, "primaryLabel") ? (
              <Link href={safeHref(propStr(p, "primaryHref"), "/academy")} className="wax-btn wax-btn-primary">
                {propStr(p, "primaryLabel")}
              </Link>
            ) : null}
            {propStr(p, "secondaryLabel") ? (
              <Link href={safeHref(propStr(p, "secondaryHref"), "/pages/contact")} className="wax-btn wax-btn-ghost">
                {propStr(p, "secondaryLabel")}
              </Link>
            ) : null}
          </div>
          {stats.length ? (
            <div className="wax-stat-row">
              {stats.map((s, i) => (
                <div key={i} className="wax-stat">
                  <strong>{s.value}</strong>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {layout !== "centered" && image ? (
          <div className={`wax-portrait wax-rise${frame === "blob" ? " wax-frame-blob" : ""}`} style={{ animationDelay: "0.12s" }}>
            <div className="wax-portrait-frame">
              <Img src={image} alt={propStr(p, "imageAlt", propStr(p, "title"))} />
            </div>
            {floatA ? (
              <span className="wax-float wax-float-a" style={CSS_SAFE.test(propStr(p, "floatABg")) ? { background: propStr(p, "floatABg") } : undefined}>
                {floatA}
              </span>
            ) : null}
            {floatB ? (
              <span className="wax-float wax-float-b" style={CSS_SAFE.test(propStr(p, "floatBBg")) ? { background: propStr(p, "floatBBg"), color: "#fff" } : undefined}>
                {floatB}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}

export function CourseGridWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const source = propStr(p, "source", "live")
  const count = Math.max(1, Math.min(24, propNum(p, "count", 6)))
  const live = useAcademyCourses(source === "live", count)
  const manual: CourseRow[] = parseRows(p.items, ["title", "level", "meta", "price", "image", "href", "badge", "tint", "desc"])
    .filter((r) => r.title)
    .map((r) => ({
      title: r.title,
      level: r.level || "",
      meta: r.meta || "",
      price: r.price || "",
      image: r.image || "",
      href: r.href || "/academy",
      badge: r.badge || "",
      tint: r.tint || "",
      desc: r.desc || "",
    }))
  const detail = propStr(p, "detailHref", "/academy/{slug}")
  const rows: CourseRow[] =
    source === "live" && live && live.length
      ? live.map((c) => ({
          ...c,
          href: c.slug ? detail.replace("{slug}", c.slug) : c.href,
        }))
      : manual

  const cols = Math.max(1, Math.min(4, propNum(p, "columns", 3)))

  return (
    <section className={shell(p)} style={{ ...sectionBg(p), ["--wax-cols" as string]: cols }}>
      <Head title={propStr(p, "title")} subtitle={propStr(p, "subtitle")} accent={propStr(p, "titleAccent")} />
      {!rows.length ? (
        <p className="wax-empty">{source === "live" && live === null ? "در حال بارگذاری دوره‌ها…" : "دوره‌ای برای نمایش تنظیم نشده است."}</p>
      ) : (
        <div className={`wax-course-grid${propStr(p, "tone") === "chalk" ? " wax-course-grid-chalk" : ""}`}>
          {rows.map((c, i) => {
            const href = safeHref(c.href, "/academy")
            const img = safeMedia(c.image)
            return (
              <Link
                key={`${c.title}-${i}`}
                href={href}
                className="wax-course wax-rise"
                style={{
                  animationDelay: `${Math.min(i, 6) * 0.05}s`,
                  ...(c.tint && CSS_SAFE.test(c.tint) ? { ["--wax-tint" as string]: c.tint } : {}),
                }}
              >
                <div className="wax-course-media">
                  {img ? <Img src={img} alt={c.title} loading="lazy" /> : <span className="wax-course-icon" aria-hidden="true">✎</span>}
                  {c.badge ? <span className="wax-badge">{c.badge}</span> : null}
                </div>
                <div className="wax-course-body">
                  <h3>{c.title}</h3>
                  {c.level ? <div className="wax-course-en">{c.level}</div> : null}
                  <div className="wax-meta">
                    {c.meta ? <span>{c.meta}</span> : null}
                    {c.badge ? <span className="wax-chip-accent">{c.badge}</span> : null}
                  </div>
                  {c.desc ? <p className="wax-course-desc">{c.desc}</p> : null}
                  {c.price ? <div className="wax-price"><PriceOrText value={c.price} from="IRT" /></div> : null}
                </div>
              </Link>
            )
          })}
        </div>
      )}
      {propStr(p, "moreLabel") ? (
        <Link href={safeHref(propStr(p, "moreHref"), "/academy")} className="wax-more">
          {propStr(p, "moreLabel")} →
        </Link>
      ) : null}
    </section>
  )
}

export function InstructorGridWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const rows = parseRows(p.items, ["name", "role", "creds", "bio", "photo", "href"]).filter((r) => r.name)
  const cols = Math.max(1, Math.min(4, propNum(p, "columns", 3)))
  if (!rows.length) return <section className={shell(p)}><p className="wax-empty">اساتید را در تنظیمات ویجت وارد کنید.</p></section>
  return (
    <section className={shell(p)} style={{ ...sectionBg(p), ["--wax-cols" as string]: cols }}>
      <Head title={propStr(p, "title")} subtitle={propStr(p, "subtitle")} />
      <div className="wax-instructor-grid">
        {rows.map((r, i) => {
          const photo = safeMedia(r.photo)
          const body = (
            <>
              {photo ? <Img src={photo} alt={r.name} loading="lazy" /> : <div style={{ width: "6.5rem", height: "6.5rem", borderRadius: "50%", margin: "0 auto 0.85rem", background: "var(--wax-soft)" }} />}
              <h3>{r.name}</h3>
              {r.role ? <div className="role">{r.role}</div> : null}
              {r.creds ? <div className="creds">{r.creds}</div> : null}
              {r.bio ? <p className="bio">{r.bio}</p> : null}
            </>
          )
          return r.href ? (
            <a key={i} href={safeHref(r.href)} className="wax-instructor wax-rise">
              {body}
            </a>
          ) : (
            <div key={i} className="wax-instructor wax-rise">
              {body}
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function CurriculumTimelineWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const rows = parseRows(p.items, ["title", "text", "meta"]).filter((r) => r.title)
  if (!rows.length) return <section className={shell(p)}><p className="wax-empty">مراحل مسیر یادگیری را وارد کنید.</p></section>
  return (
    <section className={shell(p)} style={sectionBg(p)}>
      <Head title={propStr(p, "title")} subtitle={propStr(p, "subtitle")} />
      <ol className="wax-timeline">
        {rows.map((r, i) => (
          <li key={i} className="wax-tl-item wax-rise" style={{ animationDelay: `${i * 0.06}s` }}>
            <h3>{r.title}</h3>
            {r.text ? <p>{r.text}</p> : null}
            {r.meta ? <span className="wax-tl-meta">{r.meta}</span> : null}
          </li>
        ))}
      </ol>
    </section>
  )
}

export function EnrollCtaWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const perks = parseRows(p.perks, ["text"]).filter((r) => r.text)
  return (
    <section className={shell(p)} style={sectionBg(p)}>
      <div className="wax-enroll">
        <div className="wax-rise">
          {propStr(p, "eyebrow") ? <div className="wax-eyebrow">{propStr(p, "eyebrow")}</div> : null}
          {propStr(p, "title") ? <h2 className="wax-title" style={{ maxWidth: "22ch" }}>{propStr(p, "title")}</h2> : null}
          {propStr(p, "text") ? <p className="wax-text">{propStr(p, "text")}</p> : null}
          {perks.length ? (
            <ul className="wax-perks">
              {perks.map((x, i) => (
                <li key={i}>{x.text}</li>
              ))}
            </ul>
          ) : null}
          <div className="wax-actions">
            {propStr(p, "primaryLabel") ? (
              <Link href={safeHref(propStr(p, "primaryHref"), "/pages/contact")} className="wax-btn wax-btn-primary">
                {propStr(p, "primaryLabel")}
              </Link>
            ) : null}
            {propStr(p, "secondaryLabel") ? (
              <Link href={safeHref(propStr(p, "secondaryHref"), "/academy")} className="wax-btn wax-btn-ghost">
                {propStr(p, "secondaryLabel")}
              </Link>
            ) : null}
          </div>
        </div>
        {(propStr(p, "price") || propStr(p, "priceNote")) && (
          <div className="wax-enroll-card wax-rise">
            {propStr(p, "price") ? <p className="wax-price-lg">{propStr(p, "price")}</p> : null}
            {propStr(p, "priceNote") ? <p className="wax-text" style={{ marginTop: "0.5rem" }}>{propStr(p, "priceNote")}</p> : null}
          </div>
        )}
      </div>
    </section>
  )
}

export function AcademyStatsWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const rows = parseRows(p.items, ["value", "label", "hint"]).filter((r) => r.value || r.label)
  if (!rows.length) return <section className={shell(p)}><p className="wax-empty">آمار را وارد کنید.</p></section>
  return (
    <section className={shell(p)} style={sectionBg(p)}>
      <Head title={propStr(p, "title")} subtitle="" />
      <div className="wax-stats-grid">
        {rows.map((r, i) => (
          <div key={i} className="wax-stat-card wax-rise" style={{ animationDelay: `${i * 0.05}s` }}>
            <strong>{r.value}</strong>
            <span>{r.label}</span>
            {r.hint ? <small>{r.hint}</small> : null}
          </div>
        ))}
      </div>
    </section>
  )
}

export function LogoCloudWidget({ widget }: { widget: WidgetNode }) {
  const p = widget.props
  const rows = parseRows(p.items, ["name", "image", "href"]).filter((r) => r.name || r.image)
  const marquee = propBool(p, "marquee", false)
  if (!rows.length) return <section className={shell(p)}><p className="wax-empty">لوگوها را وارد کنید.</p></section>
  const logos = rows.map((r, i) => {
    const img = safeMedia(r.image)
    const inner = img ? <Img src={img} alt={r.name || "logo"} loading="lazy" /> : <span>{r.name}</span>
    return r.href ? (
      <a key={i} href={safeHref(r.href)} className="wax-logo">
        {inner}
      </a>
    ) : (
      <span key={i} className="wax-logo">
        {inner}
      </span>
    )
  })
  return (
    <section className={shell(p)}>
      <Head title={propStr(p, "title")} subtitle="" />
      <div className={`wax-logos ${marquee ? "marquee" : ""}`}>
        {marquee ? (
          <div className="wax-logo-track">
            {logos}
            {logos}
          </div>
        ) : (
          logos
        )}
      </div>
    </section>
  )
}

export function renderAcademyWidget(widget: WidgetNode) {
  switch (widget.type) {
    case "academy-hero":
      return <AcademyHeroWidget widget={widget} />
    case "course-grid":
      return <CourseGridWidget widget={widget} />
    case "instructor-grid":
      return <InstructorGridWidget widget={widget} />
    case "curriculum-timeline":
      return <CurriculumTimelineWidget widget={widget} />
    case "enroll-cta":
      return <EnrollCtaWidget widget={widget} />
    case "academy-stats":
      return <AcademyStatsWidget widget={widget} />
    case "logo-cloud":
      return <LogoCloudWidget widget={widget} />
    default:
      return null
  }
}
