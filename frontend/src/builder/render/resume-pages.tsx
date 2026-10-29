"use client"

/* Full-page bespoke resume themes, data-driven from the Resume module:
 *   resume.page_story — «Story»: giant name over a cut-out portrait, parallax, one chapter per experience, case studies from portfolio.
 *   resume.page_os    — «Webina OS»: desktop of windows (terminal, career git log, package.json skills, project launcher) + ⌘K palette.
 * Accent: resume settings accent → site accent (builder globals) → theme default. Cut-out = identity cover image (transparent PNG), else avatar. */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"

import { durationLabel, faDigits, formatResumeDate, type ResumeDate } from "../../../modules/resume/lib/jalali"
import { optLabel, tr, trList } from "../../../modules/resume/lib/schema"
import { DEFAULT_GLOBALS } from "../globals"
import type { WidgetNode } from "../types"
import { contactHref, GLYPH, useResumeData, type ResumePayload } from "./resume-widgets"
import { useBuilderGlobals, useBuilderRuntime } from "./runtime"
import "./resume-story.css"
import "./resume-os.css"
import { Img } from "./img"

type Row = Record<string, unknown> & { id: number; is_placeholder?: boolean }
type Lang = "fa" | "en"
const THEME_ACCENT: Record<string, string> = { story: "#e8502a", "webina-os": "#e8502a", vitality: "#c2577a", "clinical-journal": "#e1846b", tide: "#2a7f86", fluent: "#c45c26" }

export function useBase(widget: WidgetNode, theme: string) {
  const data = useResumeData()
  const runtime = useBuilderRuntime()
  const globals = useBuilderGlobals()
  const p = widget.props as Record<string, unknown>
  const pl = typeof p.lang === "string" ? p.lang : "auto"
  const lang: Lang = pl === "fa" || pl === "en" ? pl : runtime.lang === "en" || runtime.lang === "fa" ? runtime.lang : data?.settings?.default_lang === "en" ? "en" : "fa"
  const siteAccent = globals?.colors?.accent && globals.colors.accent !== DEFAULT_GLOBALS.colors.accent ? globals.colors.accent : null
  const accent = (data?.settings?.accent as string | undefined) || siteAccent || THEME_ACCENT[theme]
  const showPh = p.show_placeholder === true
  return { data, lang, accent, showPh, p }
}

export function helpers(d: ResumePayload, lang: Lang, showPh: boolean) {
  const EN = lang === "en"
  const L = (fa: string, en: string) => (EN ? en : fa)
  const N = (x: string | number) => (EN ? String(x) : faDigits(x))
  const T = (r: Row | null | undefined, k: string) => tr(r, k, lang)
  const keep = (rows: Row[] | undefined) => (rows ?? []).filter((r) => showPh || !r.is_placeholder)
  const media = (id: unknown) => (typeof id === "number" ? d.media?.[String(id)]?.url ?? null : null)
  const DT = (x: unknown) => formatResumeDate(x as ResumeDate, lang, (d.settings?.date_calendar as "auto") ?? "auto")
  const exps = keep(d.experiences).sort((a, b) => String((a.start as ResumeDate | null)?.g ?? "").localeCompare(String((b.start as ResumeDate | null)?.g ?? "")))
  const skillName = (id: unknown) => { const s = d.skills.find((x) => x.id === id); return s ? T(s, "name") : "" }
  const id = d.identity ?? ({ id: 0 } as Row)
  const cutout = media(id.cover_media_id) ?? media(id.avatar_media_id)
  const name = T(id, "full_name")
  const [first, ...rest] = name.split(/\s+/)
  const contacts = keep(d.contacts)
  const projects = keep(d.projects)
  const since = typeof id.career_start_year === "number" ? (id.career_start_year as number) : null
  const sinceLabel = since ? (EN ? String(since) : faDigits(since - 621)) : ""
  const years = since ? new Date().getFullYear() - since : null
  const primary = contacts.find((c) => c.is_primary) ?? contacts[0]
  return { EN, L, N, T, keep, media, DT, exps, skillName, id, cutout, name, first: first ?? "", last: rest.join(" "), contacts, projects, since, sinceLabel, years, primary }
}

export const short = (v: unknown) => String(v ?? "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")
function LangSw({ lang, p }: { lang: Lang; p: Record<string, unknown> }) {
  return (
    <div className="lsw" role="navigation" aria-label={lang === "fa" ? "زبان" : "Language"}>
      <a href={typeof p.fa_href === "string" ? p.fa_href : "/"} hrefLang="fa" className={lang === "fa" ? "on" : ""} aria-current={lang === "fa" ? "page" : undefined}>فا</a>
      <a href={typeof p.en_href === "string" ? p.en_href : "/en"} hrefLang="en" className={lang === "en" ? "on" : ""} aria-current={lang === "en" ? "page" : undefined}>EN</a>
    </div>
  )
}

/* =========================== Story =========================== */
export function ResumeStoryPage({ widget }: { widget: WidgetNode }) {
  const { data, lang, accent, showPh, p } = useBase(widget, "story")
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let raf = 0
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => root.current?.querySelectorAll<HTMLElement>("[data-p]").forEach((e) => { e.style.translate = `0 ${window.scrollY * Number(e.dataset.p)}px` })) }
    window.addEventListener("scroll", on, { passive: true })
    return () => window.removeEventListener("scroll", on)
  }, [])
  if (!data) return <div className="rzx-story" style={{ minHeight: "100vh" }} aria-busy="true" />
  const h = helpers(data, lang, showPh)
  const { L, N, T } = h
  const skills = h.keep(data.skills)
  const highlights = trList(data.about, "highlights", lang)
  const aboutBody = T(data.about, "body")
  const manifesto = highlights.length ? highlights : aboutBody.split(/(?<=[.!؟?])\s+/).slice(0, 3)
  const stat = h.keep(data.stats)[0]
  const quotes = h.keep(data.testimonials)
  const misc: [string, string, Row[], (r: Row) => string, (r: Row) => string | null][] = [
    ["افتخارات", "Honors", h.keep(data.honors), (r) => T(r, "title"), () => null],
    ["نشرها", "Publications", h.keep(data.publications), (r) => T(r, "title"), (r) => (r.url ? String(r.url) : null)],
    ["گواهینامه‌ها", "Certifications", h.keep(data.certifications), (r) => T(r, "name"), (r) => (r.credential_url ? String(r.credential_url) : null)],
  ]
  const nl1 = Math.max(4, (h.EN ? h.first.toUpperCase() : h.first).length)
  const nl2 = Math.max(4, (h.EN ? h.last.toUpperCase() : h.last).length)
  return (
    <div ref={root} className="rzx-story" dir={h.EN ? "ltr" : "rtl"} lang={lang} style={{ "--acc": accent, "--nl1": nl1, "--nl2": nl2 } as CSSProperties}>
      <section className="hero" aria-label={h.name}>
        <div className="grain" />
        <nav>
          <a className="brand" href="#top">{h.first}.</a>
          <a className="lk" href="#story">{L("داستان", "Story")}</a>
          {h.projects.length ? <a className="lk" href="#work">{L("پروژه‌ها", "Work")}</a> : null}
          <a className="lk" href="#skills">{L("مهارت‌ها", "Skills")}</a>
          <div className="sp" />
          <LangSw lang={lang} p={p} />
          {h.primary ? <a className="hire" href={contactHref(String(h.primary.type), String(h.primary.value))}>{L("شروع همکاری", "Hire me")} {h.EN ? "→" : "←"}</a> : null}
        </nav>
        <div className="back" aria-hidden>{h.EN ? h.first.toUpperCase() : h.first}</div>
        <div className="halo" aria-hidden /><div className="arch" aria-hidden />
        {h.cutout ? <Img className="cut" data-p=".12" src={h.cutout} alt={h.name} priority /> : <div className="cut ph-cut" aria-hidden>{h.first.slice(0, 1)}</div>}
        <h1 className="front">{h.EN ? h.last.toUpperCase() : h.last}<span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}> {h.first}</span></h1>
        <div className="side s1">
          {h.since ? <div><small>{L("از سال", "SINCE")}</small><b>{h.sinceLabel}</b></div> : null}
          <div>{T(h.id, "headline")}<br /><span style={{ opacity: 0.7 }}>{T(h.id, "location")}</span></div>
        </div>
        <div className="side s2">
          {stat ? <div><small>{T(stat, "label")}</small><b>{N(String(stat.value ?? ""))}</b></div> : null}
          <div>{skills.slice(0, 4).map((s) => T(s, "name")).join(" · ")}</div>
        </div>
        <div className="scroll"><i />{L("اسکرول کن، داستان شروع می‌شه", "Scroll, the story begins")}</div>
      </section>
      {skills.length ? (
        <div className="tape" aria-hidden><span>{Array.from({ length: 8 }).map((_, k) => <span key={k}>{skills.map((s) => <span key={s.id}>{T(s, "name")}<i>✺</i></span>)}</span>)}</span></div>
      ) : null}
      {manifesto.length ? (
        <section className="man" id="story">
          <small>{L("مانیفست", "MANIFESTO")}</small>
          {manifesto.map((line, i) => { const w = line.split(" "); return <span key={i}>{w.slice(0, -1).join(" ")} <em>{w[w.length - 1]}</em> </span> })}
          {highlights.length && aboutBody ? <><br /><span className="dim">{aboutBody.split(/(?<=[.!؟?])\s+/).slice(-1)[0]}</span></> : null}
        </section>
      ) : null}
      {h.exps.map((x, i) => {
        const logo = h.media(x.company_logo_media_id)
        const img = (Array.isArray(x.media_ids) ? (x.media_ids as number[]) : []).map(h.media).find(Boolean)
        const skillsOf = (Array.isArray(x.skill_ids) ? (x.skill_ids as number[]) : []).map(h.skillName).filter(Boolean)
        const ach = trList(x, "achievements", lang)
        const yr = h.EN ? String((x.start as ResumeDate | null)?.g ?? "").slice(0, 4) : faDigits(String((x.start as ResumeDate | null)?.j ?? "").slice(0, 4))
        return (
          <section key={x.id} className={`chap c${(i % 3) + 1}`}>
            <div className="yr" aria-hidden>{yr}</div>
            <div>
              <div className="cn">{L("فصل", "CHAPTER")} {N(String(i + 1).padStart(2, "0"))} · {T(x, "company")}</div>
              <h2>{T(x, "title")}<span>{T(x, "company")}</span></h2>
              <div className="meta">
                {x.employment_type ? <b>{optLabel(String(x.employment_type), lang)}</b> : null}
                <b>{h.DT(x.start)} {h.EN ? "→" : "←"} {x.is_current ? L("اکنون", "Present") : h.DT(x.end)}</b>
                {x.duration_months ? <b>{durationLabel(x.duration_months as number, lang)}</b> : null}
              </div>
              {T(x, "description") ? <p>{T(x, "description")}</p> : null}
              {skillsOf.length ? <div className="tags">{skillsOf.map((s) => <em key={s}>{s}</em>)}</div> : null}
            </div>
            <div className="vis">
              {img ? <Img src={img} alt="" loading="lazy" /> : logo ? <div className="logo"><Img src={logo} alt={T(x, "company")} loading="lazy" /></div> : (
                <div className="code" dir="ltr">
                  <b>{"// "}{T(x, "company") || T(x, "title")}</b><br />
                  {(ach.length ? ach : skillsOf).slice(0, 6).map((a) => <span key={a}><i>›</i> {a}<br /></span>)}<br />
                  <b>status: {x.is_current ? "HEAD → main ●" : "merged ✓"}</b>
                </div>
              )}
            </div>
          </section>
        )
      })}
      <div id="work" />
      {h.projects.map((pr, i) => {
        const cover = h.media(pr.cover_media_id) ?? (Array.isArray(pr.gallery_media_ids) ? (pr.gallery_media_ids as number[]).map(h.media).find(Boolean) : null)
        const link = String(pr.url || pr.repo_url || "")
        return (
          <section key={pr.id} className={`case ${["cs1", "cs2", "cs3"][i % 3]}`}>
            <div className="idx">{L("مطالعه موردی", "CASE STUDY")} {N(String(i + 1).padStart(2, "0"))} / {N(String(h.projects.length).padStart(2, "0"))}</div>
            <div>
              {T(pr, "role") ? <div className="k">{T(pr, "role")}</div> : null}
              <h3>{T(pr, "title")}</h3>
              {T(pr, "summary") ? <p>{T(pr, "summary")}</p> : null}
              <div className={`tags ${i % 3 === 0 ? "d" : "l"}`}>{trList(pr, "tags", lang).map((t) => <em key={t}>{t}</em>)}</div>
              {link ? <p><a href={link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline", textUnderlineOffset: 5 }} dir="ltr">{short(link)} ↗</a></p> : null}
            </div>
            <div className="browser">
              <div className="t"><b /><b /><b /><span>{short(link) || T(pr, "title")}</span></div>
              {cover ? <Img src={cover} alt={T(pr, "title")} loading="lazy" /> : (
                <div className={`ui ${i % 3 === 1 ? "dark" : ""}`} aria-hidden><div className="sb"><i /><i /><i /><i /><i /></div><div className="mn"><div /><div /><div /><div /></div></div>
              )}
            </div>
          </section>
        )
      })}
      <section className="wall" id="skills">
        <div><h4>{L("جعبه‌ابزار", "TOOLBOX")}</h4><div className="sk">{skills.map((s) => <span key={s.id}>{T(s, "name")}</span>)}</div></div>
        <div>
          <h4>{L("تحصیلات و زبان", "EDUCATION & LANGUAGES")}</h4>
          {h.keep(data.educations).map((e) => (
            <div className="ed" key={e.id}><div className="d">{h.DT(e.start)}<br />{h.DT(e.end)}</div><div><h5>{[T(e, "degree"), T(e, "field")].filter(Boolean).join(h.EN ? ", " : "، ")}</h5><p>{T(e, "school")}</p></div></div>
          ))}
          {h.keep(data.languages).map((l) => <div className="ed" key={l.id}><div className="d">{T(l, "name")}</div><div><h5>{optLabel(String(l.proficiency), lang)}</h5></div></div>)}
        </div>
      </section>
      {misc.some((m) => m[2].length) ? (
        <section className="soon">
          {misc.filter((m) => m[2].length).map(([fa, en, rows, title, href]) => (
            <div key={en}>{L(fa, en)}<ul>{rows.slice(0, 5).map((r) => <li key={r.id}>{href(r) ? <a href={href(r)!} target="_blank" rel="noopener noreferrer">{title(r)}</a> : title(r)}{r.is_placeholder ? <span className="ph"> {L("نمونه", "Sample")}</span> : null}</li>)}</ul></div>
          ))}
        </section>
      ) : null}
      {quotes.length ? (
        <section className="quotes">{quotes.map((q) => <figure key={q.id}><blockquote>{T(q, "body")}</blockquote><figcaption>{T(q, "author")} · {T(q, "author_title")}</figcaption></figure>)}</section>
      ) : null}
      <section className="end" id="contact">
        {h.cutout ? <div className="mini"><Img src={h.cutout} alt="" loading="lazy" /></div> : null}
        <h2>{L("بیا یه چیز", "Let’s build")}<span>{L("بزرگ بسازیم.", "something big.")}</span></h2>
        <div className="cts">{h.contacts.map((c) => (
          <a key={c.id} href={contactHref(String(c.type), String(c.value))} target={/^(tel|mailto):/.test(contactHref(String(c.type), String(c.value))) ? undefined : "_blank"} rel="noopener noreferrer me">
            <small>{T(c, "label") || optLabel(String(c.type), lang)}</small><b dir="ltr">{short(c.value)}</b>
          </a>
        ))}</div>
        <div className="foot"><span>© {N(h.EN ? new Date().getFullYear() : new Date().getFullYear() - 621)} {h.name}</span><span>{L("ساخته‌شده با وبینا", "Built with Webina")}</span></div>
      </section>
    </div>
  )
}

/* =========================== Webina OS =========================== */
function spark(seed: number, col: string) {
  const pts: string[] = []
  let v = 20
  for (let i = 0; i < 24; i++) { v = Math.max(6, Math.min(50, v + Math.sin(i * seed) * 9 + i / 3)); pts.push(`${(i * (300 / 23)).toFixed(1)},${(56 - v).toFixed(1)}`) }
  return (
    <svg viewBox="0 0 300 56" preserveAspectRatio="none" aria-hidden>
      <defs><linearGradient id={`g${seed}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={col} stopOpacity=".45" /><stop offset="1" stopColor={col} stopOpacity="0" /></linearGradient></defs>
      <polygon fill={`url(#g${seed})`} points={`0,56 ${pts.join(" ")} 300,56`} /><polyline fill="none" stroke={col} strokeWidth="2" points={pts.join(" ")} />
    </svg>
  )
}
function Win({ cls = "", title, children, dir, style, id }: { cls?: string; title: string; children: React.ReactNode; dir?: "ltr" | "rtl"; style?: CSSProperties; id?: string }) {
  return <section id={id} className={`w ${cls}`} dir={dir} style={style}><div className="wt"><div className="dots" aria-hidden><b /><b /><b /></div><div className="tt mono">{title}</div></div><div className="wb">{children}</div></section>
}

export function ResumeOsPage({ widget }: { widget: WidgetNode }) {
  const { data, lang, accent, showPh, p } = useBase(widget, "webina-os")
  const [pal, setPal] = useState(false)
  const [q, setQ] = useState("")
  const [clock, setClock] = useState("")
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPal((v) => !v) } if (e.key === "Escape") setPal(false) }
    window.addEventListener("keydown", k)
    const t = () => setClock(new Date().toLocaleTimeString(lang === "fa" ? "fa-IR" : "en-GB", { hour: "2-digit", minute: "2-digit" }))
    t(); const iv = window.setInterval(t, 30000)
    return () => { window.removeEventListener("keydown", k); window.clearInterval(iv) }
  }, [lang])
  const h = useMemo(() => (data ? helpers(data, lang, showPh) : null), [data, lang, showPh])
  if (!data || !h) return <div className="rzx-os" style={{ minHeight: "100vh" }} aria-busy="true" />
  const { L, N, T } = h
  const sk = h.keep(data.skills)
  const langs = h.keep(data.languages)
  const statRows = h.keep(data.stats)
  const COLS = ["var(--acc)", "var(--y)", "var(--g)", "var(--b)"]
  const kpis = (statRows.length ? statRows.slice(0, 4).map((s) => [N(String(s.value ?? "")), T(s, "label")]) : [
    h.years ? [`${N(h.years)}+`, L("سال تجربه", "years shipping")] : null,
    [N(h.exps.filter((x) => x.is_current).length), L("نقش فعال", "active roles")],
    [N(h.projects.length), L("پروژه", "projects")],
    [N(sk.length), L("مهارت", "skills")],
  ].filter(Boolean)) as string[][]
  const sections = [
    ["career", L("سوابق کاری", "Career"), h.exps.length], ["projects", L("پروژه‌ها", "Projects"), h.projects.length], ["skills", L("مهارت‌ها", "Skills"), sk.length],
    ["education", L("تحصیلات", "Education"), h.keep(data.educations).length], ["contact", L("تماس", "Contact"), h.contacts.length],
  ] as [string, string, number][]
  const items = [
    ...sections.map(([a, t, c]) => ({ href: `#${a}`, label: t, meta: N(c) })),
    ...h.exps.map((x) => ({ href: "#career", label: `${T(x, "title")} · ${T(x, "company")}`, meta: h.DT(x.start) })),
    ...h.projects.map((x) => ({ href: "#projects", label: T(x, "title"), meta: trList(x, "tags", lang).slice(0, 2).join(" · ") })),
    ...sk.map((x) => ({ href: "#skills", label: T(x, "name"), meta: optLabel(String(x.category ?? ""), lang) })),
    ...h.contacts.map((c) => ({ href: contactHref(String(c.type), String(c.value)), label: `${optLabel(String(c.type), lang)} · ${short(c.value)}`, meta: "↗" })),
  ]
  const found = q ? items.filter((it) => it.label.toLowerCase().includes(q.toLowerCase())) : items.slice(0, 8)
  const enName = tr(h.id, "full_name", "en")
  const handle = (enName.split(/\s+/)[0] || "me").toLowerCase()
  const highlights = trList(data.about, "highlights", lang)
  const misc: [string, string, Row[], string][] = [["افتخارات", "Honors", h.keep(data.honors), "title"], ["نشرها", "Publications", h.keep(data.publications), "title"], ["گواهینامه‌ها", "Certifications", h.keep(data.certifications), "name"]]
  return (
    <div className="rzx-os" dir={h.EN ? "ltr" : "rtl"} lang={lang} style={{ "--acc": accent, "--nl": Math.max(4, Math.max(h.first.length, h.last.length)) } as CSSProperties}>
      <div className="bar">
        <div className="logo"><i />{h.first} OS</div>
        <nav className="menu">{sections.map(([a, t]) => <a key={a} href={`#${a}`}>{t}</a>)}</nav>
        <div className="sp" />
        {h.id.open_to_work ? <div className="pill h"><span className="live" />{L("آنلاین · پاسخ‌گو", "online · responding")}</div> : null}
        <button type="button" className="pill h mono" onClick={() => setPal(true)} aria-label={L("جستجو در رزومه", "Search résumé")} style={{ background: "none", color: "inherit", cursor: "pointer" }}>⌘K</button>
        <LangSw lang={lang} p={p} />
        <div className="pill mono" suppressHydrationWarning>{clock}</div>
      </div>
      <main className="desk">
        <section className="w hero">
          <div className="l">
            {h.exps.find((x) => x.is_current) ? <div className="tag"><span className="live" />{L("در حال ساخت", "currently building")} {T(h.exps.filter((x) => x.is_current).slice(-1)[0], "company")}</div> : null}
            <div className="en2 mono">{tr(h.id, "full_name", h.EN ? "fa" : "en")} · {T(h.id, "location")}</div>
            <h1>{h.first}<span>{h.last}</span></h1>
            <p className="hl">{T(h.id, "headline")}</p>
            <div className="chips">{sk.slice(0, 8).map((s) => <em className="mono" key={s.id}>{T(s, "name")}</em>)}</div>
            <div className="btns">
              {h.primary ? <a className="btn" href={contactHref(String(h.primary.type), String(h.primary.value))}>{L("اجرای پروژه با من", "Start a project")} <span className="kbd mono">↵</span></a> : null}
              <button type="button" className="btn g" onClick={() => setPal(true)} style={{ cursor: "pointer", font: "inherit", fontWeight: 800 }}>{L("جستجو در رزومه", "Search résumé")} <span className="kbd mono">⌘K</span></button>
            </div>
          </div>
          <div className="r">
            <div className="ring" />
            {h.cutout ? <Img src={h.cutout} alt={h.name} priority /> : <div className="ph-cut" aria-hidden>{h.first.slice(0, 1)}</div>}
            {sk[0] ? <div className="chipf mono" style={{ top: 24, insetInlineStart: 20 }}><span className="live" />{T(sk[0], "name")} <b>·</b> {sk[1] ? T(sk[1], "name") : ""}</div> : null}
            {h.exps.length ? <div className="chipf" style={{ bottom: 22, insetInlineStart: 20 }}>{T(h.exps[h.exps.length - 1], "title")} · <b>{T(h.exps[h.exps.length - 1], "company")}</b></div> : null}
          </div>
        </section>
        <Win cls="term" title={`~/${handle} — zsh`} dir="ltr">
          <div><span className="p">➜</span> <span className="c">~</span> whoami</div><div>{enName || h.name}</div>
          <div><span className="p">➜</span> <span className="c">~</span> cat role.txt</div><div>{tr(h.id, "headline", "en") || T(h.id, "headline")}</div>
          <div><span className="p">➜</span> <span className="c">~</span> git log --oneline career</div>
          {[...h.exps].reverse().map((x) => <div key={x.id}><span style={{ color: "var(--y)" }}>{String((x.start as ResumeDate | null)?.g ?? "").slice(0, 4)}</span> {tr(x, "title", "en")} @ {tr(x, "company", "en")}</div>)}
          <div><span className="p">➜</span> <span className="c">~</span> ls skills/</div>
          <div className="m">{sk.map((s) => tr(s, "name", "en")).join(" · ")}</div>
          {langs.length ? <><div><span className="p">➜</span> <span className="c">~</span> cat languages</div>{langs.map((l) => <div key={l.id}>{tr(l, "name", "en")} <span className="m">({optLabel(String(l.proficiency), "en")})</span></div>)}</> : null}
          <div><span className="p">➜</span> <span className="c">~</span> open contact <span className="cur" /></div>
        </Win>
        <div className="kpis">{kpis.map((k, i) => (
          <Win key={i} cls="kpi" title={["uptime.sh", "roles.json", "deploys.log", "stack.lock"][i % 4]}><div className="v mono">{k[0]}</div><div className="lb">{k[1]}</div>{spark([1.1, 0.7, 1.7, 0.45][i % 4], ["#e8502a", "#ffd23f", "#3ddc97", "#5b8cff"][i % 4] === "#e8502a" ? accent : ["#e8502a", "#ffd23f", "#3ddc97", "#5b8cff"][i % 4])}</Win>
        ))}</div>
        <Win id="career" cls="career" title={L("سوابق.app · شاخه اصلی", "Career.app · main branch")}>
          <div className="git">{[...h.exps].reverse().map((x, i) => (
            <div key={x.id} className="cm" style={{ color: COLS[i % 4] }}>
              <div className="when mono">{h.DT(x.start)} → {x.is_current ? L("اکنون", "now") : h.DT(x.end)}</div>
              <div className="node mono">{String((x.start as ResumeDate | null)?.g ?? "").slice(2, 4)}</div>
              <div style={{ color: "var(--text)" }}>
                <h3>{T(x, "title")} <span className="co">{T(x, "company")}</span> {x.is_current ? <span className="br mono" style={{ color: "var(--g)" }}>HEAD</span> : <span className="br mono" style={{ color: "var(--muted)" }}>merged</span>}</h3>
                {T(x, "description") ? <p>{T(x, "description")}</p> : null}
                <div className="chips">{(Array.isArray(x.skill_ids) ? (x.skill_ids as number[]) : []).map(h.skillName).filter(Boolean).map((s) => <em className="mono" key={s}>{s}</em>)}</div>
              </div>
            </div>
          ))}</div>
        </Win>
        <Win id="skills" cls="pkg" title="package.json" dir="ltr">
          <div className="mono"><span className="m">{"{"}</span><br />&nbsp;&quot;<span className="k">name</span>&quot;: &quot;<span className="s">{(enName || "me").toLowerCase().replace(/\s+/g, "-")}</span>&quot;,<br />
            {h.since ? <>&nbsp;&quot;<span className="k">since</span>&quot;: <span className="s">{h.since}</span>,<br /></> : null}&nbsp;&quot;<span className="k">dependencies</span>&quot;: {"{"}</div>
          <div className="bars">{sk.map((s, i) => <div key={s.id}><span className="mono">{tr(s, "name", "en")}</span><i style={{ width: `${s.level ? Number(s.level) * 20 : Math.max(30, 100 - i * 6)}%` }} /></div>)}</div>
          <div className="mono m" style={{ marginTop: 8 }}>&nbsp;{"}"}<br />{"}"}</div>
        </Win>
        <Win id="projects" cls="apps" title={L("پروژه‌ها · لانچر", "Projects · Launcher")}>
          {h.projects.map((pr, i) => {
            const cover = h.media(pr.cover_media_id) ?? (Array.isArray(pr.gallery_media_ids) ? (pr.gallery_media_ids as number[]).map(h.media).find(Boolean) : null)
            const link = String(pr.url || pr.repo_url || "")
            return (
              <a key={pr.id} className="app" href={link || undefined} target={link ? "_blank" : undefined} rel="noopener noreferrer">
                <div className="sh" style={{ background: [`linear-gradient(135deg,${accent},#3a1206)`, "linear-gradient(135deg,#1e3a8a,#0b1020)", "linear-gradient(135deg,#3ddc97,#0b3b2a)", "repeating-linear-gradient(45deg,#14161f 0 10px,#191c28 10px 20px)"][i % 4] }}>
                  {cover ? <Img src={cover} alt={T(pr, "title")} loading="lazy" /> : <><div className="mono" style={{ fontSize: 12, opacity: 0.85 }} dir="ltr">{short(link)}</div><div className="mini" aria-hidden><i /><div style={{ display: "grid", gap: 6 }}><i style={{ height: 10, width: "70%" }} /><i style={{ height: 40 }} /><i style={{ height: 10, width: "40%" }} /></div></div></>}
                </div>
                <div className="ab"><h4>{T(pr, "title")} {pr.is_placeholder ? <span className="ph">{L("نمونه", "Sample")}</span> : null}</h4><p>{[T(pr, "role"), ...trList(pr, "tags", lang)].filter(Boolean).join(" · ")}</p></div>
              </a>
            )
          })}
        </Win>
        <Win id="education" cls="edu" title={L("تحصیلات.app", "Education.app")}>
          {h.keep(data.educations).map((e) => <div className="row" key={e.id}><div className="ic">{(T(e, "degree") || T(e, "school")).slice(0, 1)}</div><div><h4>{T(e, "school")}</h4><p>{[T(e, "degree"), T(e, "field")].filter(Boolean).join(" · ")}</p><p className="mono">{h.DT(e.start)} → {h.DT(e.end)}</p></div></div>)}
          {langs.length ? <div className="row"><div className="ic" style={{ background: "#5b8cff22", color: "#8fb0ff" }}>Aa</div><div><h4>{L("زبان‌ها", "Languages")}</h4><p>{langs.map((l) => `${T(l, "name")}: ${optLabel(String(l.proficiency), lang)}`).join(" · ")}</p></div></div> : null}
          <div className="sys mono" dir="ltr"><span>user</span><b>{handle}</b>{h.years ? <><span>uptime</span><b>{h.years} yrs</b></> : null}<span>loc</span><b>{tr(h.id, "location", "en") || T(h.id, "location")}</b></div>
        </Win>
        <Win id="contact" cls="msg" title={L("پیام‌ها · تماس", "Messages · Contact")}>
          <div className="ct">{h.contacts.map((c) => (
            <a key={c.id} href={contactHref(String(c.type), String(c.value))} target={/^(tel|mailto):/.test(contactHref(String(c.type), String(c.value))) ? undefined : "_blank"} rel="noopener noreferrer me">
              <i>{GLYPH[String(c.type)] ?? "•"}</i><span style={{ minWidth: 0 }}><small>{T(c, "label") || optLabel(String(c.type), lang)}</small><b dir="ltr">{short(c.value)}</b></span>
            </a>
          ))}</div>
        </Win>
        {T(data.about, "body") ? (
          <Win title={L("درباره · README.md", "About · README.md")} style={{ gridColumn: "span 7" }}>
            <p style={{ fontSize: 17, lineHeight: 2.1, color: "#cfd2e3", whiteSpace: "pre-line" }}>{T(data.about, "body")}</p>
            {highlights.length ? <div className="focus">{highlights.slice(0, 8).map((f) => <div key={f}>{f}</div>)}</div> : null}
          </Win>
        ) : null}
        {misc.some((m) => m[2].length) ? (
          <div className="misc">{misc.filter((m) => m[2].length).map(([fa, en, rows, key]) => (
            <Win key={en} title={L(fa, en)}>{rows.map((r) => <div className="row" key={r.id}><div><h4>{T(r, key)} {r.is_placeholder ? <span className="ph">{L("نمونه", "Sample")}</span> : null}</h4><p>{T(r, "issuer") || T(r, "publisher")}</p></div></div>)}</Win>
          ))}</div>
        ) : null}
        {sk.length ? <div className="marq" aria-hidden><span>{Array.from({ length: 6 }).map((_, k) => <span key={k}>{sk.map((s) => <span key={s.id}>{tr(s, "name", "en")} <b>✦</b> </span>)}</span>)}</span></div> : null}
      </main>
      <div className={`pal ${pal ? "on" : ""}`} role="dialog" aria-modal="true" aria-label={L("جستجو در رزومه", "Search résumé")}>
        <div className="q"><b style={{ color: "var(--acc)" }}>⌘</b>
          {pal ? <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("دنبال چه می‌گردی؟", "Search…")} aria-label={L("جستجو", "Search")} /> : <span />}
          <button type="button" className="kbd mono" onClick={() => setPal(false)} style={{ color: "inherit", cursor: "pointer" }}>esc</button>
        </div>
        <ul>{found.slice(0, 10).map((it, i) => (
          <li key={`${it.href}-${i}`} className={i ? "" : "a"} onClick={() => { setPal(false); setQ(""); if (it.href.startsWith("#")) document.querySelector(it.href)?.scrollIntoView({ behavior: "smooth" }); else window.open(it.href, "_blank", "noopener") }}>
            <span className="mono" style={{ color: "var(--acc2)" }}>›</span>{it.label}<em className="mono">{it.meta}</em>
          </li>
        ))}</ul>
      </div>
      <nav className="dock" aria-label="dock">{[["#top", "me"], ["#career", "cv"], ["#projects", "git"], ["#skills", "sk"], ["#contact", "✉"]].map(([href, t], i) => <a key={href} href={href}><b className={`mono ${i ? "" : "on"}`}>{t}</b></a>)}</nav>
    </div>
  )
}
