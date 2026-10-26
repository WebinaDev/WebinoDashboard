"use client"

/* Full-page resume themes (round 2), data-driven from the Resume module:
 *   resume.page_vitality — «Vitality»: soft clinical-chic, arch portrait, ECG line, pulse timeline, molecule highlight cards.
 *   resume.page_journal  — «Clinical Journal»: scientific-paper layout, petri-dish portrait, animated DNA helix, §-numbered sections.
 * Accent = resume settings accent → site accent → theme default. Cut-out = identity cover image, else avatar. Highlights
 * (about.highlights) render as research/focus cards. Nothing person-specific is hard-coded. */

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react"

import { faDigits } from "../../../modules/resume/lib/jalali"
import { optLabel, trList } from "../../../modules/resume/lib/schema"
import type { WidgetNode } from "../types"
import { helpers, short, useBase } from "./resume-pages"
import { contactHref, GLYPH } from "./resume-widgets"
import "./resume-fonts.css"
import "./resume-vitality.css"
import "./resume-journal.css"

type Row = Record<string, unknown> & { id: number }
type Lang = "fa" | "en"
const PROF_W: Record<string, number> = { native: 100, full: 90, professional: 78, limited: 50, elementary: 30 }

function useReveal(root: React.RefObject<HTMLDivElement | null>, dep: unknown) {
  useEffect(() => {
    const el = root.current
    if (!el) return
    const items = el.querySelectorAll<HTMLElement>(".rv")
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches || navigator.webdriver) {
      items.forEach((e) => e.classList.add("in"))
      return
    }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target) } }), { threshold: 0.12 })
    items.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [root, dep])
}

function LangLink({ lang, p }: { lang: Lang; p: Record<string, unknown> }) {
  const fa = typeof p.fa_href === "string" ? p.fa_href : "/"
  const en = typeof p.en_href === "string" ? p.en_href : "/en"
  return <a className="lang" href={lang === "fa" ? en : fa} hrefLang={lang === "fa" ? "en" : "fa"}>{lang === "fa" ? "EN" : "فا"}</a>
}

const ICON: Record<string, ReactNode> = {
  email: <path d="M3 6h18v12H3z M3 6l9 7 9-7" />,
  phone: <path d="M5 4h4l2 5-3 2a11 11 0 005 5l2-3 5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2" />,
  linkedin: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 10v7M8 7v.1M12 17v-4a2 2 0 014 0v4M12 10v7" /></>,
  orcid: <><circle cx="12" cy="12" r="9" /><path d="M9 8v.1M9 11v6M12 8h2a4.5 4.5 0 010 9h-2z" /></>,
  website: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
}
export function ContactIcon({ type }: { type: string }) {
  const g = ICON[type]
  if (!g) return <i className="gl" aria-hidden>{GLYPH[type] ?? "•"}</i>
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="20" height="20" aria-hidden>{g}</svg>
}

const common = useBase

/* =========================== Vitality =========================== */
export function ResumeVitalityPage({ widget }: { widget: WidgetNode }) {
  const { data, lang, accent, showPh, p } = common(widget, "vitality")
  const root = useRef<HTMLDivElement>(null)
  useReveal(root, data)
  if (!data) return <div className="rzx-vit" style={{ minHeight: "100vh" }} aria-busy="true" />
  const h = helpers(data, lang, showPh)
  const { L, N, T } = h
  const skills = h.keep(data.skills)
  const stats = h.keep(data.stats)
  const edus = h.keep(data.educations)
  const pubs = h.keep(data.publications)
  const certs = h.keep(data.certifications)
  const honors = h.keep(data.honors)
  const langs = h.keep(data.languages)
  const highlights = trList(data.about, "highlights", lang)
  const body = T(data.about, "body")
  const sentences = body.split(/(?<=[.!؟?])\s+/).filter(Boolean)
  const quote = sentences[0] ?? ""
  const exps = [...h.exps].reverse()
  const edu0 = edus[0]
  const range = (r: Row) => `${h.DT(r.start)} – ${r.is_current || !r.end ? L("اکنون", "Present") : h.DT(r.end)}`
  const molec = <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="24" cy="10" r="5" /><circle cx="10" cy="34" r="5" /><circle cx="38" cy="34" r="5" /><path d="M21 14l-8 16M27 14l8 16M15 34h18" /></svg>
  const flask = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path d="M9 3h6M10 3v6L4 20h16L14 9V3" /></svg>
  const nav: [string, string][] = [["about", L("درباره", "About")], ["exp", L("سوابق", "Practice")], ["edu", L("تحصیلات", "Education")], ["cred", L("مدارک", "Credentials")], ["contact", L("تماس", "Contact")]]
  let n = 0
  const num = () => N(String(++n).padStart(2, "0"))
  return (
    <div ref={root} className="rzx-vit" dir={h.EN ? "ltr" : "rtl"} lang={lang} style={{ "--acc": accent } as CSSProperties}>
      <nav><a className="brand" href="#top">{h.first} <b>{h.last ? h.last.slice(0, 1) + "." : ""}</b></a><ul>{nav.map(([id, l]) => <li key={id}><a href={`#${id}`}>{l}</a></li>)}</ul><LangLink lang={lang} p={p} /></nav>
      <header className="hero" id="top">
        <div className="cell" style={{ width: 260, height: 260, background: "color-mix(in srgb,var(--acc) 30%,#fff)", top: "12%", insetInlineStart: -80 }} />
        <div className="cell" style={{ width: 140, height: 140, background: "#cfe0d5aa", bottom: "18%", insetInlineStart: "40%", animationDelay: "-5s" }} />
        <div className="cell" style={{ width: 90, height: 90, background: "#f7d8c7", top: "20%", insetInlineEnd: "6%", animationDelay: "-9s" }} />
        <div className="rv">
          {skills.length ? <span className="eyebrow"><i /><span>{skills.slice(0, 2).map((s) => T(s, "name")).join(" · ")}</span></span> : null}
          <h1>{h.first}{h.last ? <><br /><em>{h.last}</em></> : null}</h1>
          <p className="lede">{T(h.id, "headline")}</p>
          <div className="cta">
            {h.primary ? <a className="btn" href="#contact">{L("در ارتباط باشیم", "Let's connect")}</a> : null}
            {exps.length ? <a className="btn o" href="#exp">{L("مشاهده سوابق", "View practice")}</a> : null}
          </div>
        </div>
        <div className="arch rv"><div className="ring" /><div className="bg" />
          {h.cutout ? <img src={h.cutout} alt={h.name} fetchPriority="high" /> : <div className="ph-cut" style={{ position: "absolute", inset: 0 }}>{h.first.slice(0, 1)}</div>}
          {stats[0] ? <div className="badge" style={{ top: "14%", insetInlineStart: "-14%" }}><b>{N(String(stats[0].value ?? ""))}</b><span>{T(stats[0], "label")}</span></div> : null}
          {edu0 ? <div className="badge" style={{ bottom: "12%", insetInlineEnd: "-12%", animationDelay: "-2s" }}><b>{T(edu0, "degree")}</b><span>{T(edu0, "field").replace(/\s*\(.*\)/, "")}</span></div> : null}
        </div>
        <svg className="ecg" viewBox="0 0 1440 90" preserveAspectRatio="none" aria-hidden><path fill="none" stroke="var(--acc)" strokeWidth="2" d="M0 50 H420 l14 0 10 -8 10 8 H520 l10 22 16 -66 16 70 12 -26 H700 l12 -6 12 6 H1000 l10 22 16 -66 16 70 12 -26 H1180 l12 -6 12 6 H1440" /></svg>
      </header>
      {body ? (
        <section id="about"><div className="sh rv"><span>{num()}</span><h2>{L("درباره ", "About ")}<em>{h.first}</em></h2></div>
          <div className="about"><div className="quote rv">{quote}</div><div className="rv"><p>{sentences.slice(1).join(" ") || body}</p>
            {stats.length ? <div className="stats">{stats.slice(0, 4).map((s) => <div className="stat" key={s.id}><b>{N(String(s.value ?? ""))}</b><small>{T(s, "label")}</small></div>)}</div> : null}</div></div>
        </section>
      ) : null}
      {exps.length ? (
        <section id="exp" className="blush"><div className="sh rv"><span>{num()}</span><h2>{L("سوابق ", "Practice & ")}<em>{L("حرفه‌ای", "experience")}</em></h2></div>
          <div className="tl">{exps.map((x) => (
            <div className="job rv" key={x.id}><h3>{T(x, "title")}</h3>
              <div className="m"><span>{T(x, "company")}</span><span>{range(x)}</span>{x.is_current ? <span className="now">{L("فعلی", "Current")}</span> : null}</div>
              {T(x, "description") ? <p>{T(x, "description")}</p> : null}
            </div>))}</div>
        </section>
      ) : null}
      {edus.length ? (
        <section id="edu"><div className="sh rv"><span>{num()}</span><h2>{L("پیشینه ", "Academic ")}<em>{L("تحصیلی", "foundation")}</em></h2></div>
          <div className="grid2">{edus.map((e) => (
            <div className="edu rv" key={e.id}><span className="yr">{range(e)}</span><h3>{T(e, "degree")}</h3><p><b>{T(e, "field")}</b></p><p>{T(e, "school")}</p>{T(e, "description") ? <p>{T(e, "description")}</p> : null}{flask}</div>))}</div>
        </section>
      ) : null}
      {pubs.length || certs.length || honors.length ? (
        <section id="cred" className="blush"><div className="sh rv"><span>{num()}</span><h2>{L("مدارک و ", "Credentials & ")}<em>{L("آثار", "publications")}</em></h2></div>
          <div className="creds">
            <div>{pubs.map((b) => {
              const cover = h.media(b.cover_media_id)
              const links = (Array.isArray(b.links) ? (b.links as Record<string, unknown>[]) : []).filter((l) => typeof l?.url === "string" && l.url)
              const authors = trList(b, "co_authors", lang)
              const meta = [T(b, "publisher"), b.date ? h.DT(b.date) : "", b.isbn ? `ISBN ${String(b.isbn)}` : ""].filter(Boolean)
              return (
              <div className={`book rv${cover ? " has-cover" : ""}`} key={b.id} style={{ marginBottom: 20 }}>
                {cover ? <a className="bcover" href={links[0] ? String(links[0].url) : cover} target="_blank" rel="noopener noreferrer"><img src={cover} alt={T(b, "title")} loading="lazy" /></a> : null}
                <div className="bbody"><small>{optLabel(String(b.kind ?? "book"), lang)}</small><h3>{T(b, "title")}</h3>
                {authors.length ? <p className="bauth">{L("نویسندگان: ", "By ")}{authors.join(L("، ", ", "))}</p> : null}
                <p>{[T(b, "description"), ...meta].filter(Boolean).join(" · ")}</p>
                {links.length ? <div className="blinks">{links.map((l, j) => <a key={j} className={j === 0 ? "pri" : ""} href={String(l.url)} target="_blank" rel="noopener noreferrer">{String((lang === "en" ? l.label_en : l.label_fa) || l.label_en || l.label_fa || short(l.url))} ↗</a>)}</div>
                  : b.url ? <p><a href={String(b.url)} target="_blank" rel="noopener noreferrer">{short(b.url)} ↗</a></p> : null}
                {cover ? null : <div className="cv" aria-hidden />}</div></div>)
            })}</div>
            <div className="rv">{[...certs, ...honors].map((c, i) => (
              <div className="cert" key={`${c.id}-${i}`}>{(() => {
                const img = (Array.isArray(c.media_ids) ? (c.media_ids as number[]) : []).map(h.media).find(Boolean)
                return img ? <a className="thumb" href={img} target="_blank" rel="noopener noreferrer"><img src={img} alt="" loading="lazy" /></a> : <i>{N(String(i + 1).padStart(2, "0"))}</i>
              })()}<div><b>{T(c, "name") || T(c, "title")}</b>{T(c, "issuer") || c.issue_date ? <div style={{ fontSize: 13, color: "var(--mut)" }}>{[T(c, "issuer"), c.issue_date ? h.DT(c.issue_date) : ""].filter(Boolean).join(" · ")}</div> : null}{c.credential_id ? <div style={{ fontSize: 12, color: "var(--mut)", direction: "ltr", textAlign: "start" }}>ID {String(c.credential_id)}</div> : null}</div></div>))}</div>
          </div>
        </section>
      ) : null}
      {skills.length || highlights.length || langs.length ? (
        <section id="skills"><div className="sh rv"><span>{num()}</span><h2>{L("تخصص و ", "Expertise & ")}<em>{L("تمرکز", "focus")}</em></h2></div>
          <div className="chips rv">{skills.map((s, i) => <span key={s.id} className={`chip ${i < 3 ? "top" : ""}`}>{T(s, "name")}</span>)}</div>
          {highlights.length ? <div className="res">{highlights.map((x) => <div className="mol rv" key={x}>{molec}<b>{x}</b></div>)}</div> : null}
          {langs.length ? <div className="langs rv">{langs.map((l) => <div className="lg" key={l.id}><b>{T(l, "name")}</b><small>{optLabel(String(l.proficiency), lang)}</small><div className="bar"><i style={{ width: `${PROF_W[String(l.proficiency)] ?? 50}%` }} /></div></div>)}</div> : null}
        </section>
      ) : null}
      <section className="contact" id="contact"><h2 className="rv">{L("بیایید ", "Let's ")}<em>{L("در ارتباط", "connect")}</em>{L(" باشیم.", ".")}</h2>
        <div className="cl rv">{h.contacts.map((c) => { const href = contactHref(String(c.type), String(c.value)); return <a key={c.id} href={href} target={/^(tel|mailto):/.test(href) ? undefined : "_blank"} rel="noopener noreferrer me"><ContactIcon type={String(c.type)} />{T(c, "label") || optLabel(String(c.type), lang)}</a> })}</div>
        <footer>© {N(new Date().getFullYear())} {h.name}</footer></section>
    </div>
  )
}

/* =========================== Clinical Journal =========================== */
function Helix({ c1, c2 }: { c1: string; c2: string }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const ls = el.querySelectorAll("line"), cs = el.querySelectorAll("circle")
    let raf = 0
    const f = (tm: number) => {
      for (let i = 0; i < ls.length; i++) {
        const a = Math.sin(i * 0.35 + tm / 700) * 28, z = Math.cos(i * 0.35 + tm / 700)
        ls[i].setAttribute("x1", String(35 + a)); ls[i].setAttribute("x2", String(35 - a))
        cs[2 * i].setAttribute("cx", String(35 + a)); cs[2 * i + 1].setAttribute("cx", String(35 - a))
        cs[2 * i].setAttribute("r", String(3 + z * 1.5)); cs[2 * i + 1].setAttribute("r", String(3 - z * 1.5))
      }
      raf = requestAnimationFrame(f)
    }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <svg ref={ref} viewBox="0 0 70 800" preserveAspectRatio="none" aria-hidden>
      {Array.from({ length: 40 }).map((_, i) => { const y = i * 20 + 10; const a = Math.sin(i * 0.35) * 28; return <g key={i}><line x1={35 + a} x2={35 - a} y1={y} y2={y} stroke="#14403c33" /><circle r="4" cy={y} cx={35 + a} fill={c1} /><circle r="4" cy={y} cx={35 - a} fill={c2} /></g> })}
    </svg>
  )
}

export function ResumeJournalPage({ widget }: { widget: WidgetNode }) {
  const { data, lang, accent, showPh, p } = common(widget, "clinical-journal")
  const root = useRef<HTMLDivElement>(null)
  useReveal(root, data)
  if (!data) return <div className="rzx-cj" style={{ minHeight: "100vh" }} aria-busy="true" />
  const h = helpers(data, lang, showPh)
  const { L, N, T } = h
  const skills = h.keep(data.skills)
  const stats = h.keep(data.stats)
  const edus = h.keep(data.educations)
  const pubs = h.keep(data.publications)
  const certs = h.keep(data.certifications)
  const honors = h.keep(data.honors)
  const langs = h.keep(data.languages)
  const highlights = trList(data.about, "highlights", lang)
  const body = T(data.about, "body")
  const lede = body.split(/(?<=[.!؟?])\s+/)[0] ?? ""
  const exps = [...h.exps].reverse()
  const range = (r: Row) => `${h.DT(r.start)} – ${r.is_current || !r.end ? L("اکنون", "Present") : h.DT(r.end)}`
  const year = new Date().getFullYear()
  const orcid = h.contacts.find((c) => c.type === "orcid")
  const cur = exps.find((x) => x.is_current)
  let sec = 0
  const S = () => (h.EN ? "§" + ++sec : "§" + faDigits(++sec))
  return (
    <div ref={root} className="rzx-cj" dir={h.EN ? "ltr" : "rtl"} lang={lang} style={{ "--acc": accent } as CSSProperties}>
      <div className="mast"><span className="t">{h.last || h.first} <i>·</i> <span className="mono">{L(`رزومه · ویرایش ${faDigits(year - 621)}`, `Curriculum Vitae · Vol. ${year}`)}</span></span><LangLink lang={lang} p={p} /></div>
      <header className="hero">
        <div className="hl rv"><div><span className="mono">{skills.slice(0, 2).map((s) => T(s, "name")).join(" · ") || T(h.id, "headline")}</span><h1>{h.first}{h.last ? <><br /><i>{h.last}</i></> : null}</h1></div>
          <div><div className="abs"><span className="mono">{L("چکیده", "Abstract")}</span><p>{T(h.id, "headline")}{T(h.id, "location") ? ` · ${T(h.id, "location")}` : ""}</p></div>
            {stats.length ? <div className="meta">{stats.slice(0, 3).map((s) => <div key={s.id}><b>{N(String(s.value ?? ""))}</b><small>{T(s, "label")}</small></div>)}</div> : null}</div></div>
        <div className="hr"><div className="helix"><Helix c1="var(--acc)" c2="#2f6f68" /></div>
          <div className="dish rv"><div className="r" /><div className="r" /><div className="r" /><div className="face">{h.cutout ? <img src={h.cutout} alt={h.name} fetchPriority="high" /> : <div className="ph-cut" style={{ position: "absolute", inset: 0 }}>{h.first.slice(0, 1)}</div>}</div>
            {cur ? <div className="tag" style={{ top: "8%", insetInlineStart: "-6%" }}><b>●</b> {T(cur, "title")} · {T(cur, "company")}</div> : null}
            {orcid ? <div className="tag" style={{ bottom: "14%", insetInlineEnd: "-8%", animationDelay: "-2.5s" }} dir="ltr"><b>ORCID</b> {short(orcid.value).replace(/^orcid\.org\//, "")}</div> : null}
          </div></div>
      </header>
      {body ? <section><div className="sec"><div className="lbl rv"><span className="mono">{S()}</span><h2>{L("مقدمه", "Introduction")}</h2></div><div className="rv"><p className="lead">{body}</p></div></div></section> : null}
      {exps.length ? <section><div className="sec"><div className="lbl rv"><span className="mono">{S()}</span><h2>{L("سوابق کاری", "Experience")}</h2></div><div>{exps.map((x) => (
        <div className="row rv" key={x.id}><span className="d mono">{range(x)}</span><div><h3>{T(x, "title")}</h3><span className="c">{T(x, "company")}</span>{x.is_current ? <span className="live">{L("در جریان", "ongoing")}</span> : null}{T(x, "description") ? <p>{T(x, "description")}</p> : null}</div></div>))}</div></div></section> : null}
      {edus.length || certs.length ? <section><div className="sec"><div className="lbl rv"><span className="mono">{S()}</span><h2>{L("تحصیلات و مدارک", "Education & credentials")}</h2></div><div className="figs">
        {edus.map((e, i) => (
          <div className={`fig rv ${i === 0 ? "dark" : ""}`} key={e.id}><span className="mono" style={i ? { color: "var(--acc)" } : undefined}>{L(`شکل ${faDigits(i + 1)} · مدرک`, `Fig. ${i + 1} · Degree`)}</span>
            {i === 0 ? <svg className="ringc" viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" stroke="#ffffff22" /><circle className="p" cx="60" cy="60" r="50" style={{ "--o": 0 } as CSSProperties} transform="rotate(-90 60 60)" /></svg> : null}
            <h4 style={i ? { marginTop: 12 } : undefined}>{T(e, "degree")}{h.EN ? ", " : "، "}{T(e, "field")}</h4>{i === 0 ? <p style={{ opacity: 0.75, marginTop: 8 }}>{T(e, "school")}</p> : null}
            <div className="cap">{i ? `${T(e, "school")} · ` : ""}{range(e)}</div></div>))}
        {[...certs, ...honors].map((c, i) => <div className="fig rv" key={`c${c.id}-${i}`}><span className="mono" style={{ color: "var(--acc)" }}>{L("گواهی‌نامه", "Certificate")} {N(i + 1)}</span><h4 style={{ marginTop: 12 }}>{T(c, "name") || T(c, "title")}</h4>{T(c, "issuer") ? <div className="cap">{T(c, "issuer")}</div> : null}</div>)}
      </div></div></section> : null}
      {skills.length || pubs.length || langs.length ? <section><div className="sec"><div className="lbl rv"><span className="mono">{S()}</span><h2>{L("تخصص و آثار", "Expertise & publications")}</h2></div><div className="rv">
        <div className="kw">{skills.map((s, i) => <span key={s.id} className={i < 3 ? "t" : ""}>{T(s, "name")}</span>)}{highlights.map((x) => <span key={x}>{x}</span>)}</div>
        <ol className="refs" style={{ marginTop: 40 }}>
          {pubs.map((b, i) => <li key={b.id}><span className="n">[{N(i + 1)}]</span><span><b>{T(b, "title")}</b>{[T(b, "publisher"), T(b, "description")].filter(Boolean).length ? <> · <span style={{ color: "var(--mut)" }}>{[T(b, "publisher"), T(b, "description")].filter(Boolean).join(" · ")}</span></> : null}</span></li>)}
          {langs.map((l) => <li key={`l${l.id}`}><span className="n">{L("زبان", "Lang")}</span><span>{T(l, "name")} · <span style={{ color: "var(--mut)" }}>{optLabel(String(l.proficiency), lang)}</span></span></li>)}
        </ol></div></div></section> : null}
      <section className="cta"><div className="bgh"><Helix c1="color-mix(in srgb,var(--acc) 50%,#fff)" c2="#ffffff" /></div><h2 className="rv">{L("برای ", "Correspondence ")}<i>{L("همکاری", "welcome.")}</i>{L(" در تماس باشید.", "")}</h2>
        <div className="cl rv">{h.contacts.map((c) => { const href = contactHref(String(c.type), String(c.value)); return <a key={c.id} href={href} target={/^(tel|mailto):/.test(href) ? undefined : "_blank"} rel="noopener noreferrer me"><ContactIcon type={String(c.type)} /><span><small>{T(c, "label") || optLabel(String(c.type), lang)}</small><span dir="ltr">{short(c.value)}</span></span></a> })}</div>
        <span className="mono" style={{ opacity: 0.5 }}>© {N(year)} {h.name}</span></section>
    </div>
  )
}
