"use client"

/* resume.* builder widgets. One payload (GET /v1/public/resume/full) feeds every widget on the page.
 * Theme = tokens (CSS variables, light + dark pair, system mode via prefers-color-scheme) + per-theme CSS
 * (resume-widgets.css). Language: prop `lang` or the page language (runtime.lang) → fa = RTL + Jalali, en = LTR + Gregorian. */

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react"

import { durationLabel, faDigits, formatResumeDate, type ResumeDate } from "../../../modules/resume/lib/jalali"
import { optLabel, RESUME_THEMES, tr, trList } from "../../../modules/resume/lib/schema"
import type { WidgetNode } from "../types"
import { useBuilderRuntime } from "./runtime"
import "./resume-widgets.css"
import { Img } from "./img"

type Row = Record<string, unknown> & { id: number; order?: number; is_placeholder?: boolean }
export type ResumePayload = {
  identity: Row | null; about: Row | null; settings: Row & { theme_key?: string; mode?: string; date_calendar?: string; default_lang?: string; accent?: string; accent_dark?: string }
  contacts: Row[]; experiences: Row[]; educations: Row[]; honors: Row[]; publications: Row[]; certifications: Row[]; skills: Row[]; languages: Row[]
  projects: Row[]; volunteering: Row[]; courses: Row[]; testimonials: Row[]; stats: Row[]; media: Record<string, { url: string }>
}

const API = () => `${(process.env.NEXT_PUBLIC_API_URL?.trim() ?? "").replace(/\/+$/, "").replace(/\/api$/, "")}/api/v1/public/resume/full`
const KEY = "/v1/public/resume/full"
let inflight: Promise<ResumePayload | null> | null = null

export function useResumeData(): ResumePayload | null {
  const pre = (useBuilderRuntime() as { prefetch?: Record<string, unknown> }).prefetch
  const seeded = pre && KEY in pre ? (pre[KEY] as ResumePayload) : null
  const [data, setData] = useState<ResumePayload | null>(seeded)
  useEffect(() => {
    if (seeded) return
    let off = false
    const key = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("key") : null
    inflight ??= fetch(API() + (key ? `?key=${encodeURIComponent(key)}` : ""), { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null)).then((j) => (j?.data ?? null) as ResumePayload | null).catch(() => null)
    inflight.then((d) => !off && setData(d))
    return () => { off = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return seeded ?? data
}

/* ---------- helpers ---------- */
const P = (w: WidgetNode) => w.props as Record<string, unknown>
const s = (p: Record<string, unknown>, k: string, f = "") => (typeof p[k] === "string" ? (p[k] as string) : f)
const b = (p: Record<string, unknown>, k: string, f = true) => (typeof p[k] === "boolean" ? (p[k] as boolean) : f)
const n = (p: Record<string, unknown>, k: string, f = 0) => (typeof p[k] === "number" ? (p[k] as number) : f)

const UI = {
  fa: { about: "درباره من", contacts: "راه‌های ارتباطی", experience: "سوابق کاری", education: "تحصیلات و تجربیات آکادمیک", honors: "افتخارات", publications: "نشرها",
    certifications: "گواهینامه‌ها", skills: "مهارت‌ها", languages: "زبان‌ها", portfolio: "نمونه‌کارها", stats: "در یک نگاه", testimonials: "توصیه‌نامه‌ها", volunteering: "فعالیت‌های داوطلبانه",
    courses: "دوره‌ها", present: "اکنون", to: "تا", contact: "تماس با من", work: "نمونه‌کارها", sample: "نمونه", cta: "بیایید چیزی بسازیم", ctaBody: "برای همکاری، پروژه یا مشاوره در دسترسم.",
    open: "آماده همکاری", pdf: "دانلود رزومه (به‌زودی)", view: "مشاهده", code: "کد", credential: "مشاهده مدرک", more: "بیشتر", less: "کمتر" },
  en: { about: "About", contacts: "Contact", experience: "Experience", education: "Education", honors: "Honors & Awards", publications: "Publications",
    certifications: "Certifications", skills: "Skills", languages: "Languages", portfolio: "Portfolio", stats: "At a glance", testimonials: "Recommendations", volunteering: "Volunteering",
    courses: "Courses", present: "Present", to: "–", contact: "Contact me", work: "Portfolio", sample: "Sample", cta: "Let's build something", ctaBody: "Available for collaboration, projects and consulting.",
    open: "Open to work", pdf: "Download résumé (soon)", view: "View", code: "Code", credential: "Show credential", more: "More", less: "Less" },
}
type Lang = "fa" | "en"
type Ctx = { lang: Lang; t: (typeof UI)["fa"]; cal: "auto" | "jalali" | "gregorian"; data: ResumePayload; media: (id: unknown) => string | null; num: (x: string | number) => string }

const CONTACT_HREF: Record<string, (v: string) => string> = {
  phone: (v) => `tel:${v.replace(/[^\d+]/g, "")}`, email: (v) => `mailto:${v}`, whatsapp: (v) => (v.startsWith("http") ? v : `https://wa.me/${v.replace(/\D/g, "")}`),
  telegram: (v) => (v.startsWith("http") ? v : `https://t.me/${v.replace(/^@/, "")}`), instagram: (v) => (v.startsWith("http") ? v : `https://instagram.com/${v.replace(/^@/, "")}`),
  x: (v) => (v.startsWith("http") ? v : `https://x.com/${v.replace(/^@/, "")}`),
}
export const contactHref = (type: string, v: string) => (CONTACT_HREF[type]?.(v) ?? (/^https?:\/\//.test(v) ? v : `https://${v}`))
export const GLYPH: Record<string, string> = { phone: "☎", email: "@", website: "◎", linkedin: "in", github: "</>", telegram: "✈", whatsapp: "◔", instagram: "◉", x: "𝕏", youtube: "▶", dribbble: "◍", behance: "Bē", gitlab: "◆", stackoverflow: "≡", bale: "ب", eitaa: "ا", orcid: "iD", researchgate: "RG", scholar: "🎓", other: "•" }

function filterRows(rows: Row[] | undefined, p: Record<string, unknown>, dateKey?: string): Row[] {
  let out = (rows ?? []).filter((r) => b(p, "show_placeholder", false) || !r.is_placeholder)
  if (s(p, "order_by") === "date" && dateKey) out = [...out].sort((a, z) => String((z[dateKey] as ResumeDate | null)?.g ?? "9999").localeCompare(String((a[dateKey] as ResumeDate | null)?.g ?? "9999")))
  const lim = n(p, "limit", 0)
  return lim > 0 ? out.slice(0, lim) : out
}
const Ph = ({ r, c }: { r: Row; c: Ctx }) => (r.is_placeholder ? <span className="rz-ph">{c.t.sample}</span> : null)
const period = (r: Row, c: Ctx) => {
  const a = formatResumeDate(r.start as ResumeDate, c.lang, c.cal)
  const z = r.is_current ? c.t.present : formatResumeDate(r.end as ResumeDate, c.lang, c.cal)
  return a ? `${a} ${c.t.to} ${z || c.t.present}` : z
}

/* ---------- theme scope ---------- */
function themeStyle(data: ResumePayload | null, lang: Lang): CSSProperties {
  const key = data?.settings?.theme_key ?? "code-noir"
  const th = RESUME_THEMES[key] ?? RESUME_THEMES["code-noir"]
  const st: Record<string, string> = {}
  for (const [k, v] of Object.entries(th.tokens.light)) st[`--rzl${k.slice(1)}`] = v
  for (const [k, v] of Object.entries(th.tokens.dark)) st[`--rzd${k.slice(1)}`] = v
  if (data?.settings?.accent) st["--rzl-accent"] = data.settings.accent
  if (data?.settings?.accent_dark) st["--rzd-accent"] = data.settings.accent_dark
  st["--rz-font"] = lang === "fa" ? th.tokens.font_fa : th.tokens.font_en
  st["--rz-mono"] = th.tokens.font_mono
  st["--rz-radius"] = th.tokens.radius
  st["--rz-shadow"] = th.tokens.shadow
  return st as CSSProperties
}

function Scope({ w, data, lang, children, title, extraClass = "" }: { w: WidgetNode; data: ResumePayload | null; lang: Lang; children: ReactNode; title?: string; extraClass?: string }) {
  const p = P(w)
  const key = data?.settings?.theme_key ?? "code-noir"
  const mode = data?.settings?.mode && data.settings.mode !== "system" ? data.settings.mode : "system"
  const heading = s(p, "title") || title
  return (
    <section id={s(p, "anchor_id") || undefined} lang={lang} dir={lang === "fa" ? "rtl" : "ltr"} data-rz-theme={key} data-rz-mode={mode}
      data-rz-default={RESUME_THEMES[key]?.tokens.default_mode ?? "dark"} style={themeStyle(data, lang)}
      className={`rz rz-${w.type.replace("resume.", "")} rz-v-${s(p, "variant", "default")} ${b(p, "full_width", true) ? "rz-full" : ""} ${extraClass}`}>
      <div className="rz-in">
        {heading ? <header className="rz-h"><h2><span>{heading}</span></h2>{s(p, "subtitle") ? <p className="rz-sub">{s(p, "subtitle")}</p> : null}</header> : null}
        {children}
      </div>
    </section>
  )
}

/* ---------- widgets ---------- */
function Hero({ c, p }: { c: Ctx; p: Record<string, unknown> }) {
  const id = c.data.identity ?? ({} as Row)
  const avatar = c.media(id.avatar_media_id)
  const name = tr(id, "full_name", c.lang)
  const other = tr(id, "full_name", c.lang === "fa" ? "en" : "fa")
  const stats = filterRows(c.data.stats, { show_placeholder: b(p, "show_placeholder", false) })
  const primary = c.data.contacts.find((x) => x.is_primary) ?? c.data.contacts[0]
  const variant = s(p, "variant", "split")
  return (
    <div className="rz-hero-in">
      {b(p, "show_avatar") ? (
        <div className="rz-avatar">{avatar ? <Img src={avatar} alt={name} loading="eager" /> : <span>{(name || "?").slice(0, 1)}</span>}</div>
      ) : null}
      <div className="rz-hero-text">
        <p className="rz-kicker">{variant === "terminal" ? <code>$ whoami</code> : null}{tr(id, "location", c.lang)}{id.open_to_work ? <span className="rz-open">{c.t.open}</span> : null}</p>
        <h1>{name}</h1>
        {other && other !== name ? <p className="rz-alt" lang={c.lang === "fa" ? "en" : "fa"} dir={c.lang === "fa" ? "ltr" : "rtl"}>{other}</p> : null}
        <p className="rz-headline">{tr(id, "headline", c.lang)}</p>
        {b(p, "show_cta") ? (
          <div className="rz-cta">
            <a className="rz-btn" href={s(p, "cta_target", "#contact") || (primary ? contactHref(String(primary.type), String(primary.value)) : "#contact")}>{s(p, "cta_label") || c.t.contact}</a>
            <a className="rz-btn rz-ghost" href="#portfolio">{c.t.work}</a>
          </div>
        ) : null}
      </div>
      {b(p, "show_stats") && stats.length ? (
        <div className="rz-stats">{stats.map((x) => <div className="rz-stat" key={x.id}><b>{c.num(String(x.value ?? ""))}</b><small>{tr(x, "label", c.lang)}</small></div>)}</div>
      ) : null}
    </div>
  )
}

function About({ c, p }: { c: Ctx; p: Record<string, unknown> }) {
  const a = c.data.about
  const body = tr(a, "body", c.lang)
  const hl = trList(a, "highlights", c.lang)
  if (!body && !hl.length) return null
  return (
    <div className="rz-about">
      {body.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
      {b(p, "show_highlights") && hl.length ? <ul className="rz-highlights">{hl.map((h) => <li key={h}>{h}</li>)}</ul> : null}
    </div>
  )
}

function Contacts({ c, p }: { c: Ctx; p: Record<string, unknown> }) {
  const only = s(p, "types_filter").split(",").map((x) => x.trim()).filter(Boolean)
  const rows = filterRows(c.data.contacts, p).filter((r) => !only.length || only.includes(String(r.type)))
  return (
    <div className="rz-contacts">
      {rows.map((r) => {
        const type = String(r.type)
        const v = String(r.value ?? "")
        return (
          <a key={r.id} className="rz-contact rz-card" href={contactHref(type, v)} target={/^(tel|mailto):/.test(contactHref(type, v)) ? undefined : "_blank"} rel="noopener noreferrer me">
            <i aria-hidden>{GLYPH[type] ?? "•"}</i>
            <span><small>{tr(r, "label", c.lang) || optLabel(type, c.lang)}</small><b dir="ltr">{v.replace(/^https?:\/\/(www\.)?/, "")}</b></span>
            <Ph r={r} c={c} />
          </a>
        )
      })}
    </div>
  )
}

function SkillChips({ ids, c }: { ids: unknown; c: Ctx }) {
  const list = (Array.isArray(ids) ? ids : []).map((id) => c.data.skills.find((s2) => s2.id === id)).filter(Boolean) as Row[]
  return list.length ? <div className="rz-chips">{list.map((x) => <em key={x.id}>{tr(x, "name", c.lang)}</em>)}</div> : null
}

function Experience({ c, p }: { c: Ctx; p: Record<string, unknown> }) {
  const rows = filterRows(c.data.experiences, p, "start")
  const [open, setOpen] = useState<Record<number, boolean>>({})
  const variant = s(p, "variant", "timeline")
  return (
    <div className={variant === "timeline" ? "rz-timeline" : variant === "cards" ? "rz-grid2" : "rz-compact"}>
      {rows.map((r) => {
        const desc = tr(r, "description", c.lang)
        const collapsed = b(p, "collapse_description", false) && !open[r.id]
        const logo = c.media(r.company_logo_media_id)
        return (
          <article key={r.id} className="rz-tl">
            {variant === "timeline" ? <span className="rz-dot" aria-hidden /> : null}
            <div className="rz-card">
              <div className="rz-row">
                {logo ? <Img className="rz-logo" src={logo} alt="" loading="lazy" /> : null}
                <h3>{tr(r, "title", c.lang)}</h3><Ph r={r} c={c} />
                <span className="rz-date">{period(r, c)}{b(p, "show_duration") && r.duration_months ? <> · {durationLabel(r.duration_months as number, c.lang)}</> : null}</span>
              </div>
              <p className="rz-co">
                {r.company_url ? <a href={String(r.company_url)} target="_blank" rel="noopener noreferrer">{tr(r, "company", c.lang)}</a> : tr(r, "company", c.lang)}
                {r.employment_type ? ` · ${optLabel(String(r.employment_type), c.lang)}` : ""}
                {tr(r, "location", c.lang) ? ` · ${tr(r, "location", c.lang)}` : ""}{r.location_type ? ` · ${optLabel(String(r.location_type), c.lang)}` : ""}
              </p>
              {desc && variant !== "compact" ? <p className={`rz-desc ${collapsed ? "rz-clamp" : ""}`}>{desc}</p> : null}
              {desc && b(p, "collapse_description", false) ? <button type="button" className="rz-more" onClick={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))}>{open[r.id] ? c.t.less : c.t.more}</button> : null}
              {trList(r, "achievements", c.lang).length && variant !== "compact" ? <ul className="rz-ach">{trList(r, "achievements", c.lang).map((a) => <li key={a}>{a}</li>)}</ul> : null}
              {b(p, "show_skills") ? <SkillChips ids={r.skill_ids} c={c} /> : null}
            </div>
          </article>
        )
      })}
    </div>
  )
}

function Education({ c, p }: { c: Ctx; p: Record<string, unknown> }) {
  const rows = filterRows(c.data.educations, p, "start")
  const tl = s(p, "variant", "timeline") === "timeline"
  return (
    <div className={tl ? "rz-timeline" : "rz-grid3"}>
      {rows.map((r) => (
        <article key={r.id} className="rz-tl">
          {tl ? <span className="rz-dot" aria-hidden /> : null}
          <div className="rz-card">
            <div className="rz-row"><h3>{tr(r, "school", c.lang)}</h3><Ph r={r} c={c} /><span className="rz-date">{period(r, c)}</span></div>
            <p className="rz-co">{[tr(r, "degree", c.lang), tr(r, "field", c.lang), r.grade ? c.num(String(r.grade)) : ""].filter(Boolean).join(" · ")}</p>
            {tr(r, "description", c.lang) ? <p className="rz-desc">{tr(r, "description", c.lang)}</p> : null}
            {tr(r, "activities", c.lang) ? <p className="rz-muted">{tr(r, "activities", c.lang)}</p> : null}
          </div>
        </article>
      ))}
    </div>
  )
}

function SimpleGrid({ rows, c, p, render, list }: { rows: Row[]; c: Ctx; p: Record<string, unknown>; render: (r: Row) => ReactNode; list?: boolean }) {
  return <div className={list ? "rz-list" : "rz-grid3"}>{filterRows(rows, p).map((r) => <div key={r.id} className="rz-card rz-mini"><Ph r={r} c={c} />{render(r)}</div>)}</div>
}

function Publications({ c, p }: { c: Ctx; p: Record<string, unknown> }) {
  const kinds = s(p, "kinds_filter").split(",").map((x) => x.trim()).filter(Boolean)
  const rows = filterRows(c.data.publications, p, "date").filter((r) => !kinds.length || kinds.includes(String(r.kind)))
  const shelf = s(p, "variant", "shelf") === "shelf"
  return (
    <div className={shelf ? "rz-shelf" : "rz-list"}>
      {rows.map((r) => {
        const cover = c.media(r.cover_media_id)
        const title = tr(r, "title", c.lang)
        const Wrap = r.url ? "a" : "div"
        return (
          <Wrap key={r.id} className="rz-card rz-pub" {...(r.url ? { href: String(r.url), target: "_blank", rel: "noopener noreferrer" } : {})}>
            {b(p, "show_cover") ? <div className="rz-book">{cover ? <Img src={cover} alt="" loading="lazy" /> : <span>{title.slice(0, 2)}</span>}</div> : null}
            <div><Ph r={r} c={c} /><h3>{title}</h3>
              <p className="rz-co">{[optLabel(String(r.kind ?? ""), c.lang), tr(r, "publisher", c.lang), formatResumeDate(r.date as ResumeDate, c.lang, c.cal)].filter(Boolean).join(" · ")}</p>
              {tr(r, "description", c.lang) ? <p className="rz-desc">{tr(r, "description", c.lang)}</p> : null}
            </div>
          </Wrap>
        )
      })}
    </div>
  )
}

function Skills({ c, p }: { c: Ctx; p: Record<string, unknown> }) {
  const cat = s(p, "category")
  const rows = filterRows(c.data.skills, p).filter((r) => !cat || r.category === cat)
  const variant = s(p, "variant", "chips")
  const group = b(p, "group_by_category", false) || variant === "grouped"
  const render = (list: Row[]) =>
    variant === "bars" ? (
      <div className="rz-bars">{list.map((r) => (
        <div key={r.id} className="rz-bar"><span>{tr(r, "name", c.lang)}<Ph r={r} c={c} /></span>
          {b(p, "show_level") && r.level ? <i role="meter" aria-valuemin={1} aria-valuemax={5} aria-valuenow={Number(r.level)} aria-label={tr(r, "name", c.lang)} style={{ "--v": `${Number(r.level) * 20}%` } as CSSProperties} /> : null}
        </div>))}</div>
    ) : <div className="rz-chips rz-big">{list.map((r) => <em key={r.id} title={r.years ? `${c.num(Number(r.years))}+` : undefined}>{tr(r, "name", c.lang)}</em>)}</div>
  if (!group) return render(rows)
  const cats = [...new Set(rows.map((r) => String(r.category ?? "other")))]
  return <div className="rz-groups">{cats.map((k) => <div key={k} className="rz-group"><h3>{optLabel(k, c.lang)}</h3>{render(rows.filter((r) => String(r.category ?? "other") === k))}</div>)}</div>
}

const PROF: Record<string, number> = { native: 5, full: 4, professional: 3, limited: 2, elementary: 1 }
function Languages({ c, p }: { c: Ctx; p: Record<string, unknown> }) {
  const rows = filterRows(c.data.languages, p)
  if (s(p, "variant", "chips") === "chips") return <div className="rz-chips rz-big">{rows.map((r) => <em key={r.id}>{tr(r, "name", c.lang)} · <small>{optLabel(String(r.proficiency), c.lang)}</small></em>)}</div>
  return (
    <div className="rz-grid3">{rows.map((r) => (
      <div key={r.id} className="rz-card rz-mini"><Ph r={r} c={c} /><h3>{tr(r, "name", c.lang)}</h3><p className="rz-co">{optLabel(String(r.proficiency), c.lang)}</p>
        <div className="rz-meter" aria-hidden>{[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= (PROF[String(r.proficiency)] ?? 0) ? "on" : ""} />)}</div></div>))}</div>
  )
}

function Portfolio({ c, p }: { c: Ctx; p: Record<string, unknown> }) {
  const rows = filterRows(c.data.projects, p, "start").filter((r) => !b(p, "featured_only", false) || r.featured)
  const variant = s(p, "variant", "grid")
  return (
    <div className={`rz-port rz-port-${variant}`} style={{ "--cols": Math.min(4, Math.max(1, n(p, "columns", 3))) } as CSSProperties}>
      {rows.map((r) => {
        const cover = c.media(r.cover_media_id)
        const title = tr(r, "title", c.lang)
        return (
          <article key={r.id} className="rz-card rz-proj">
            <div className="rz-thumb">{cover ? <Img src={cover} alt={title} loading="lazy" /> : <span>{title.slice(0, 2)}</span>}</div>
            <div className="rz-pb">
              <div className="rz-row"><h3>{title}</h3><Ph r={r} c={c} />{r.featured ? <span className="rz-star" aria-label="featured">★</span> : null}</div>
              {tr(r, "role", c.lang) ? <p className="rz-co">{tr(r, "role", c.lang)}</p> : null}
              {tr(r, "summary", c.lang) ? <p className="rz-desc">{tr(r, "summary", c.lang)}</p> : null}
              <div className="rz-chips">{trList(r, "tags", c.lang).map((tg) => <em key={tg}>{tg}</em>)}</div>
              <div className="rz-links">
                {r.url ? <a href={String(r.url)} target="_blank" rel="noopener noreferrer">{c.t.view} ↗</a> : null}
                {r.repo_url ? <a href={String(r.repo_url)} target="_blank" rel="noopener noreferrer">{c.t.code} ↗</a> : null}
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function Testimonials({ c, p }: { c: Ctx; p: Record<string, unknown> }) {
  const rows = filterRows(c.data.testimonials, p)
  return (
    <div className={s(p, "variant", "slider") === "slider" ? "rz-slider" : "rz-grid2"}>
      {rows.map((r) => {
        const av = c.media(r.avatar_media_id)
        return (
          <figure key={r.id} className="rz-card rz-quote"><Ph r={r} c={c} />
            <blockquote>{tr(r, "body", c.lang)}</blockquote>
            <figcaption>{av ? <Img src={av} alt="" loading="lazy" /> : null}<span><b>{tr(r, "author", c.lang)}</b><small>{[tr(r, "author_title", c.lang), tr(r, "relation", c.lang)].filter(Boolean).join(" · ")}</small></span></figcaption>
          </figure>
        )
      })}
    </div>
  )
}

function ContactCta({ c, p }: { c: Ctx; p: Record<string, unknown> }) {
  const want = s(p, "primary_contact_type")
  const ct = (want ? c.data.contacts.find((x) => x.type === want) : null) ?? c.data.contacts.find((x) => x.is_primary) ?? c.data.contacts[0]
  return (
    <div className="rz-final">
      <h2>{s(p, "heading") || c.t.cta}</h2>
      <p>{s(p, "body") || c.t.ctaBody}</p>
      {ct ? <a className="rz-btn" dir="ltr" href={contactHref(String(ct.type), String(ct.value))}>{String(ct.value).replace(/^https?:\/\/(www\.)?/, "")}</a> : null}
    </div>
  )
}

function LangSwitch({ c, p }: { c: Ctx; p: Record<string, unknown> }) {
  return (
    <nav className="rz-lang" aria-label={c.lang === "fa" ? "زبان" : "Language"}>
      <a href={s(p, "fa_href", "/")} hrefLang="fa" lang="fa" aria-current={c.lang === "fa" ? "page" : undefined} className={c.lang === "fa" ? "on" : ""}>فا</a>
      <a href={s(p, "en_href", "/en")} hrefLang="en" lang="en" aria-current={c.lang === "en" ? "page" : undefined} className={c.lang === "en" ? "on" : ""}>EN</a>
    </nav>
  )
}

const TITLES: Record<string, keyof (typeof UI)["fa"]> = {
  "resume.about": "about", "resume.contacts": "contacts", "resume.experience": "experience", "resume.education": "education", "resume.honors": "honors",
  "resume.publications": "publications", "resume.certifications": "certifications", "resume.skills": "skills", "resume.languages": "languages",
  "resume.portfolio": "portfolio", "resume.testimonials": "testimonials", "resume.volunteering": "volunteering", "resume.courses": "courses",
}
const ANCHORS: Record<string, string> = { "resume.contacts": "contact", "resume.portfolio": "portfolio", "resume.experience": "experience", "resume.about": "about" }

export function ResumeWidget({ widget }: { widget: WidgetNode }) {
  const data = useResumeData()
  const runtime = useBuilderRuntime()
  const p = P(widget)
  const pl = s(p, "lang", "auto")
  const lang: Lang = pl === "fa" || pl === "en" ? pl : runtime.lang === "en" || runtime.lang === "fa" ? runtime.lang : data?.settings?.default_lang === "en" ? "en" : "fa"
  const ctx = useMemo<Ctx | null>(() => (data ? {
    lang, t: UI[lang], data, cal: (data.settings?.date_calendar as Ctx["cal"]) ?? "auto",
    media: (id) => (typeof id === "number" ? data.media?.[String(id)]?.url ?? null : null),
    num: (x) => (lang === "fa" ? faDigits(x) : String(x)),
  } : null), [data, lang])
  const w = { ...widget, props: { ...p, anchor_id: s(p, "anchor_id") || ANCHORS[widget.type] || "" } }
  if (!ctx) return <Scope w={w} data={null} lang={lang}><div className="rz-skel" aria-busy="true" /></Scope>
  const title = TITLES[widget.type] ? ctx.t[TITLES[widget.type]] : undefined
  const pr = w.props as Record<string, unknown>
  let body: ReactNode = null
  switch (widget.type) {
    case "resume.hero": return <Scope w={w} data={data} lang={lang} extraClass="rz-hero"><Hero c={ctx} p={pr} /></Scope>
    case "resume.lang_switch": return <Scope w={w} data={data} lang={lang} extraClass="rz-bar-top"><LangSwitch c={ctx} p={pr} /></Scope>
    case "resume.contact_cta": return <Scope w={w} data={data} lang={lang}><ContactCta c={ctx} p={pr} /></Scope>
    case "resume.about": body = <About c={ctx} p={pr} />; break
    case "resume.contacts": body = <Contacts c={ctx} p={pr} />; break
    case "resume.experience": body = <Experience c={ctx} p={pr} />; break
    case "resume.education": body = <Education c={ctx} p={pr} />; break
    case "resume.honors": body = <SimpleGrid rows={ctx.data.honors} c={ctx} p={pr} list={s(pr, "variant") === "list"} render={(r) => <><h3>{tr(r, "title", lang)}</h3><p className="rz-co">{[tr(r, "issuer", lang), formatResumeDate(r.date as ResumeDate, lang, ctx.cal)].filter(Boolean).join(" · ")}</p>{tr(r, "description", lang) ? <p className="rz-desc">{tr(r, "description", lang)}</p> : null}</>} />; break
    case "resume.publications": body = <Publications c={ctx} p={pr} />; break
    case "resume.certifications": body = <SimpleGrid rows={ctx.data.certifications} c={ctx} p={pr} list={s(pr, "variant") === "list"} render={(r) => <><span className="rz-badge" aria-hidden>✓</span><h3>{tr(r, "name", lang)}</h3><p className="rz-co">{[tr(r, "issuer", lang), formatResumeDate(r.issue_date as ResumeDate, lang, ctx.cal)].filter(Boolean).join(" · ")}</p>{r.credential_url ? <a className="rz-link" href={String(r.credential_url)} target="_blank" rel="noopener noreferrer">{ctx.t.credential} ↗</a> : null}</>} />; break
    case "resume.skills": body = <Skills c={ctx} p={pr} />; break
    case "resume.languages": body = <Languages c={ctx} p={pr} />; break
    case "resume.portfolio": body = <Portfolio c={ctx} p={pr} />; break
    case "resume.stats": body = <div className="rz-stats">{filterRows(ctx.data.stats, pr).map((x) => <div className="rz-stat" key={x.id}><b>{ctx.num(String(x.value ?? ""))}</b><small>{tr(x, "label", lang)}</small></div>)}</div>; break
    case "resume.testimonials": body = <Testimonials c={ctx} p={pr} />; break
    case "resume.volunteering": body = <SimpleGrid rows={ctx.data.volunteering} c={ctx} p={pr} list={s(pr, "variant") !== "cards"} render={(r) => <><h3>{tr(r, "role", lang)}</h3><p className="rz-co">{[tr(r, "organization", lang), tr(r, "cause", lang), period(r, ctx)].filter(Boolean).join(" · ")}</p>{tr(r, "description", lang) ? <p className="rz-desc">{tr(r, "description", lang)}</p> : null}</>} />; break
    case "resume.courses": body = <SimpleGrid rows={ctx.data.courses} c={ctx} p={pr} list={s(pr, "variant") !== "grid"} render={(r) => <><h3>{tr(r, "name", lang)}</h3><p className="rz-co">{[tr(r, "institution", lang), formatResumeDate(r.date as ResumeDate, lang, ctx.cal)].filter(Boolean).join(" · ")}</p></>} />; break
    case "resume.download_pdf": body = <button type="button" className="rz-btn" disabled title="Phase 2">{s(pr, "label") || ctx.t.pdf}</button>; break
    default: body = null
  }
  return <Scope w={w} data={data} lang={lang} title={title}>{body}</Scope>
}
