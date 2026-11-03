"use client"

/* Premium academy widgets — tones: blush (Sanaz/Gatabi), ocean (English Bridge), light, ink. */

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
    tone === "blush" ? "wax-blush" : tone === "ocean" ? "wax-ocean" : tone === "ink" ? "wax-ink" : tone === "transparent" ? "wax-clear" : "wax-light"
  const bg = propStr(p, "bgImage") ? "wax-has-bg" : ""
  const bleed = propBool(p, "fullBleed", false) ? "wax-bleed" : ""
  const motion = propBool(p, "motion", false) ? "wax-motion" : ""
  const mfw = propBool(p, "mobileFullWidth", true) ? "wax-mfw" : ""
  return `wax wax-pad ${toneCls} ${bg} ${bleed} ${motion} ${mfw} ${extra}`.trim()
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

function Head({ title, subtitle }: { title: string; subtitle: string }) {
  if (!title && !subtitle) return null
  return (
    <header className="wax-section-head wax-rise">
      {title ? <h2>{title}</h2> : null}
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  )
}

type CourseRow = { title: string; level: string; meta: string; price: string; image: string; href: string; badge: string; slug?: string }

function useAcademyCourses(enabled: boolean, count: number) {
  const [rows, setRows] = useState<CourseRow[] | null>(null)
  useEffect(() => {
    if (!enabled) return
    let dead = false
    ;(async () => {
      try {
        const res = await fetch(`/api/v1/public/academy?per_page=${count}`, { credentials: "same-origin" })
        const json = (await res.json()) as { data?: Array<{ title?: string; slug?: string; description?: string; cover_url?: string }> }
        if (dead) return
        const list = Array.isArray(json?.data) ? json.data : []
        setRows(
          list.slice(0, count).map((c) => ({
            title: String(c.title || ""),
            level: "",
            meta: "",
            price: "",
            image: String(c.cover_url || ""),
            href: c.slug ? `/academy/${c.slug}` : "/academy",
            badge: "",
            slug: c.slug,
          })),
        )
      } catch {
        if (!dead) setRows([])
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
  const layout = propStr(p, "layout", "split")
  const image = safeMedia(propStr(p, "image"))
  const stats = parseRows(p.stats, ["value", "label"]).filter((r) => r.value || r.label)
  return (
    <section className={shell(p)} style={sectionBg(p)}>
      <div className={`wax-hero-grid ${layout}`}>
        <div className="wax-copy wax-rise">
          {propStr(p, "eyebrow") ? <div className="wax-eyebrow">{propStr(p, "eyebrow")}</div> : null}
          {propStr(p, "title") ? <h1 className="wax-title">{propStr(p, "title")}</h1> : null}
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
          <div className="wax-portrait wax-rise" style={{ animationDelay: "0.12s" }}>
            <Img src={image} alt={propStr(p, "imageAlt", propStr(p, "title"))} />
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
  const manual: CourseRow[] = parseRows(p.items, ["title", "level", "meta", "price", "image", "href", "badge"])
    .filter((r) => r.title)
    .map((r) => ({
      title: r.title,
      level: r.level || "",
      meta: r.meta || "",
      price: r.price || "",
      image: r.image || "",
      href: r.href || "/academy",
      badge: r.badge || "",
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
      <Head title={propStr(p, "title")} subtitle={propStr(p, "subtitle")} />
      {!rows.length ? (
        <p className="wax-empty">{source === "live" && live === null ? "در حال بارگذاری دوره‌ها…" : "دوره‌ای برای نمایش تنظیم نشده است."}</p>
      ) : (
        <div className="wax-course-grid">
          {rows.map((c, i) => {
            const href = safeHref(c.href, "/academy")
            const img = safeMedia(c.image)
            return (
              <Link key={`${c.title}-${i}`} href={href} className="wax-course wax-rise" style={{ animationDelay: `${Math.min(i, 6) * 0.05}s` }}>
                <div className="wax-course-media">
                  {img ? <Img src={img} alt={c.title} loading="lazy" /> : null}
                  {c.badge ? <span className="wax-badge">{c.badge}</span> : null}
                </div>
                <div className="wax-course-body">
                  <h3>{c.title}</h3>
                  <div className="wax-meta">
                    {c.level ? <span>{c.level}</span> : null}
                    {c.meta ? <span>{c.meta}</span> : null}
                  </div>
                  {c.price ? <div className="wax-price">{c.price}</div> : null}
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
