"use client"

/* Full-page resume theme (round 3), data-driven from the Resume module:
 *   resume.page_tide — «Tide»: a cinematic dive. The page starts at a sunlit water surface (caustic light, a lens-shaped
 *   portrait) and grows deeper and darker while scrolling: about at the surface, experience as swim lanes, focus areas
 *   as cells under a lens, publications as a library with reflected covers, credentials, then a bioluminescent contact.
 * A depth gauge follows scroll on desktop. Every motion is disabled under prefers-reduced-motion. Nothing is hard-coded
 * per person: all copy comes from the resume payload; section labels are generic UI strings. */

import { useEffect, useRef, type CSSProperties } from "react"

import { optLabel, trList } from "../../../modules/resume/lib/schema"
import type { WidgetNode } from "../types"
import { helpers, short, useBase } from "./resume-pages"
import { ContactIcon } from "./resume-pages-2"
import { contactHref } from "./resume-widgets"
import "./resume-fonts.css"
import "./resume-tide.css"

type Row = Record<string, unknown> & { id: number }
type Lang = "fa" | "en"
const PROF_W: Record<string, number> = { native: 100, full: 90, professional: 78, limited: 50, elementary: 30 }

function useTide(root: React.RefObject<HTMLDivElement | null>, dep: unknown) {
  useEffect(() => {
    const el = root.current
    if (!el) return
    const items = el.querySelectorAll<HTMLElement>(".rv")
    const still = typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches || navigator.webdriver
    if (still) { items.forEach((e) => e.classList.add("in")); el.classList.add("still") }
    let io: IntersectionObserver | null = null
    if (!still) {
      io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io?.unobserve(e.target) } }), { threshold: 0.12 })
      items.forEach((e) => io!.observe(e))
    }
    let raf = 0
    const on = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const max = Math.max(1, el.scrollHeight - window.innerHeight)
        const top = el.getBoundingClientRect().top + window.scrollY
        const sp = Math.min(1, Math.max(0, (window.scrollY - top) / max))
        el.style.setProperty("--sp", sp.toFixed(4))
        el.style.setProperty("--sy", String(Math.round(window.scrollY)))
        const g = el.querySelector<HTMLElement>(".gauge b")
        if (g) g.textContent = g.dataset.fmt === "fa" ? String(Math.round(sp * 100)).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]) : String(Math.round(sp * 100))
      })
    }
    on()
    window.addEventListener("scroll", on, { passive: true })
    window.addEventListener("resize", on)
    return () => { io?.disconnect(); window.removeEventListener("scroll", on); window.removeEventListener("resize", on); cancelAnimationFrame(raf) }
  }, [root, dep])
}

function LangLink({ lang, p }: { lang: Lang; p: Record<string, unknown> }) {
  const fa = typeof p.fa_href === "string" ? p.fa_href : "/"
  const en = typeof p.en_href === "string" ? p.en_href : "/en"
  return <a className="lang" href={lang === "fa" ? en : fa} hrefLang={lang === "fa" ? "en" : "fa"}>{lang === "fa" ? "EN" : "فا"}</a>
}

/* Soft caustic light: two drifting turbulence layers, static when motion is reduced (CSS pauses the animation). */
function Caustics() {
  return (
    <svg className="caus" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <filter id="tdC" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="2" seed="7" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -2.6 1.55" />
        </filter>
      </defs>
      <rect width="800" height="500" filter="url(#tdC)" />
    </svg>
  )
}

function Cell({ i }: { i: number }) {
  return (
    <svg viewBox="0 0 80 80" aria-hidden className="cellsvg" style={{ "--r": `${(i * 47) % 360}deg` } as CSSProperties}>
      <circle cx="40" cy="40" r="34" className="m" />
      <circle cx="40" cy="40" r="26" className="c" />
      <circle cx={34 + (i % 3) * 4} cy={36 + (i % 2) * 6} r="9" className="n" />
      <circle cx="56" cy="30" r="2.2" className="o" /><circle cx="26" cy="54" r="1.6" className="o" /><circle cx="54" cy="56" r="1.2" className="o" />
    </svg>
  )
}

export function ResumeTidePage({ widget }: { widget: WidgetNode }) {
  const { data, lang, accent, showPh, p } = useBase(widget, "tide")
  const root = useRef<HTMLDivElement>(null)
  useTide(root, data)
  if (!data) return <div className="rzx-tide" style={{ minHeight: "100vh" }} aria-busy="true" />
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
  const exps = [...h.exps].reverse()
  const range = (r: Row) => `${h.DT(r.start)} – ${r.is_current || !r.end ? L("اکنون", "Present") : h.DT(r.end)}`
  const location = T(h.id, "location")
  const nav: [string, string][] = [
    ["about", L("درباره", "About")], ["lanes", L("سوابق", "Experience")], ["focus", L("تمرکز", "Focus")],
    ["library", L("آثار", "Works")], ["cred", L("مدارک", "Credentials")], ["contact", L("تماس", "Contact")],
  ]
  let n = 0
  const num = () => N(String(++n).padStart(2, "0"))
  const Head = ({ k, a, b }: { k: string; a: string; b: string }) => (
    <div className="sh rv"><span className="k">{num()} · {k}</span><h2>{a}<em>{b}</em></h2></div>
  )
  return (
    <div ref={root} className="rzx-tide" dir={h.EN ? "ltr" : "rtl"} lang={lang} style={{ "--acc": accent } as CSSProperties}>
      <a className="skip" href="#about">{L("رفتن به محتوا", "Skip to content")}</a>
      <nav className="top"><a className="brand" href="#top">{h.first}<i>.</i></a>
        <ul>{nav.map(([id, l]) => <li key={id}><a href={`#${id}`}>{l}</a></li>)}</ul><LangLink lang={lang} p={p} /></nav>
      <div className="gauge" aria-hidden><span>{L("عمق", "Depth")}</span><b data-fmt={lang}>0</b><i /></div>

      <header className="hero" id="top">
        <div className="sky" aria-hidden><Caustics /><div className="rays"><i /><i /><i /><i /></div></div>
        <div className="bubbles" aria-hidden>{Array.from({ length: 9 }).map((_, i) => <i key={i} style={{ "--i": i } as CSSProperties} />)}</div>
        <div className="htxt rv">
          {location ? <span className="eyebrow"><i />{location}</span> : null}
          <h1><span>{h.first}</span>{h.last ? <em>{h.last}</em> : null}</h1>
          <p className="lede">{T(h.id, "headline")}</p>
          <div className="cta">
            {h.primary ? <a className="btn" href="#contact">{L("گفت‌وگو کنیم", "Get in touch")}</a> : null}
            <a className="btn ghost" href="#about">{L("شیرجه به داستان", "Dive into the story")}</a>
          </div>
        </div>
        <figure className="lens rv">
          <div className="halo" /><div className="ring r1" /><div className="ring r2" />
          <div className="glass">{h.cutout ? <img src={h.cutout} alt={h.name} fetchPriority="high" /> : <span className="ph">{h.first.slice(0, 1)}</span>}</div>
          {stats[0] ? <figcaption className="chip c1"><b>{N(String(stats[0].value ?? ""))}</b>{T(stats[0], "label")}</figcaption> : null}
          {edus[0] ? <figcaption className="chip c2"><b>{T(edus[0], "degree")}</b>{T(edus[0], "field").replace(/\s*\(.*\)/, "")}</figcaption> : null}
        </figure>
        <svg className="wave" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden><path d="M0 60 C240 10 480 110 720 60 S1200 10 1440 60 V120 H0Z" /><path className="w2" d="M0 80 C260 40 520 120 760 76 S1220 40 1440 84 V120 H0Z" /></svg>
        <span className="cue" aria-hidden><i />{L("اسکرول کنید", "Scroll to dive")}</span>
      </header>

      {body ? (
        <section className="z z1" id="about"><Head k={L("سطح", "Surface")} a={L("درباره‌ی ", "About ")} b={h.first} />
          <div className="about">
            <blockquote className="rv">{sentences[0]}</blockquote>
            <div className="rv"><p>{sentences.slice(1).join(" ") || body}</p>
              {stats.length ? <dl className="stats">{stats.slice(0, 4).map((s) => <div key={s.id}><dt>{N(String(s.value ?? ""))}</dt><dd>{T(s, "label")}</dd></div>)}</dl> : null}</div>
          </div>
        </section>
      ) : null}

      {exps.length || edus.length ? (
        <section className="z z2" id="lanes"><Head k={L("مسیرها", "Lanes")} a={L("مسیر ", "Career ")} b={L("حرفه‌ای", "lanes")} />
          <ol className="lanes">{exps.map((x, i) => (
            <li className="lane rv" key={x.id} style={{ "--d": `${i * 80}ms` } as CSSProperties}>
              <span className="no">{N(i + 1)}</span>
              <div className="lb"><h3>{T(x, "title")}</h3>
                <div className="m"><span>{T(x, "company")}</span><span>{range(x)}</span>{x.is_current ? <span className="now">{L("در جریان", "Current")}</span> : null}</div>
                {T(x, "description") ? <p>{T(x, "description")}</p> : null}</div>
              <span className="rope" aria-hidden />
            </li>))}</ol>
          {edus.length ? <div className="edus">{edus.map((e) => (
            <article className="edu rv" key={e.id}><span className="yr">{range(e)}</span><h3>{T(e, "degree")}</h3><p className="f">{T(e, "field")}</p><p>{T(e, "school")}</p>{T(e, "description") ? <p className="mut">{T(e, "description")}</p> : null}</article>))}</div> : null}
        </section>
      ) : null}

      {highlights.length || skills.length ? (
        <section className="z z3" id="focus"><Head k={L("زیر عدسی", "Under the lens")} a={L("حوزه‌های ", "Fields of ")} b={L("تمرکز", "focus")} />
          {highlights.length ? <div className="cells">{highlights.map((x, i) => <div className="cell rv" key={x} style={{ "--d": `${i * 90}ms` } as CSSProperties}><Cell i={i} /><b>{x}</b></div>)}</div> : null}
          {skills.length ? <ul className="skills rv">{skills.map((s) => <li key={s.id}>{T(s, "name")}</li>)}</ul> : null}
          {langs.length ? <div className="langs rv">{langs.map((l) => <div key={l.id}><b>{T(l, "name")}</b><small>{optLabel(String(l.proficiency), lang)}</small><span className="bar"><i style={{ width: `${PROF_W[String(l.proficiency)] ?? 50}%` }} /></span></div>)}</div> : null}
        </section>
      ) : null}

      {pubs.length ? (
        <section className="z z4" id="library"><Head k={L("کتابخانه", "Library")} a={L("کتاب‌ها و ", "Books & ")} b={L("ترجمه‌ها", "translations")} />
          <div className="books">{pubs.map((b) => {
            const cover = h.media(b.cover_media_id)
            const links = (Array.isArray(b.links) ? (b.links as Record<string, unknown>[]) : []).filter((l) => typeof l?.url === "string" && l.url)
            const authors = trList(b, "co_authors", lang)
            const meta = [T(b, "publisher"), b.date ? h.DT(b.date) : "", b.isbn ? `ISBN ${N(String(b.isbn))}` : ""].filter(Boolean)
            return (
              <article className="book rv" key={b.id}>
                <a className="cover" href={links[0] ? String(links[0].url) : String(b.url || cover || "#")} target="_blank" rel="noopener noreferrer">
                  {cover ? <img src={cover} alt={T(b, "title")} loading="lazy" /> : <span className="nocov">{T(b, "title").slice(0, 1)}</span>}
                </a>
                <div className="bb"><small>{optLabel(String(b.kind ?? "book"), lang)}</small><h3>{T(b, "title")}</h3>
                  {authors.length ? <p className="au">{L("نویسندگان: ", "By ")}{authors.join(L("، ", ", "))}</p> : null}
                  {T(b, "description") ? <p>{T(b, "description")}</p> : null}
                  {meta.length ? <p className="mut">{meta.join(" · ")}</p> : null}
                  {links.length ? <div className="bl">{links.map((l, j) => <a key={j} className={j === 0 ? "pri" : ""} href={String(l.url)} target="_blank" rel="noopener noreferrer">{String((lang === "en" ? l.label_en : l.label_fa) || l.label_en || l.label_fa || short(l.url))}<span aria-hidden> ↗</span></a>)}</div>
                    : b.url ? <div className="bl"><a className="pri" href={String(b.url)} target="_blank" rel="noopener noreferrer">{short(b.url)} ↗</a></div> : null}
                </div>
              </article>)
          })}</div>
        </section>
      ) : null}

      {certs.length || honors.length ? (
        <section className="z z5" id="cred"><Head k={L("گواهی‌ها", "Records")} a={L("مدارک و ", "Credentials & ")} b={L("افتخارات", "honors")} />
          <div className="certs">{[...certs, ...honors].map((c, i) => {
            const img = (Array.isArray(c.media_ids) ? (c.media_ids as number[]) : []).map(h.media).find(Boolean)
            const sub = [T(c, "issuer"), c.issue_date ? h.DT(c.issue_date) : c.date ? h.DT(c.date) : ""].filter(Boolean).join(" · ")
            return (
              <article className={`cert rv${img ? " has" : ""}`} key={`${c.id}-${i}`} style={{ "--d": `${(i % 3) * 70}ms` } as CSSProperties}>
                {img ? <a className="th" href={img} target="_blank" rel="noopener noreferrer"><img src={img} alt={T(c, "name") || T(c, "title")} loading="lazy" /></a> : <span className="ix">{N(String(i + 1).padStart(2, "0"))}</span>}
                <div><h3>{T(c, "name") || T(c, "title")}</h3>{sub ? <p>{sub}</p> : null}{c.credential_id ? <p className="id" dir="ltr">ID {String(c.credential_id)}</p> : null}</div>
              </article>)
          })}</div>
        </section>
      ) : null}

      <section className="z z6 contact" id="contact">
        <div className="glow" aria-hidden>{Array.from({ length: 14 }).map((_, i) => <i key={i} style={{ "--i": i } as CSSProperties} />)}</div>
        <h2 className="rv">{L("از عمق به ", "From the deep, ")}<em>{L("گفت‌وگو", "let's talk")}</em>{L(".", ".")}</h2>
        <div className="cl rv">{h.contacts.map((c) => { const href = contactHref(String(c.type), String(c.value)); return <a key={c.id} href={href} target={/^(tel|mailto):/.test(href) ? undefined : "_blank"} rel="noopener noreferrer me"><ContactIcon type={String(c.type)} /><span><small>{T(c, "label") || optLabel(String(c.type), lang)}</small><span dir="ltr">{short(c.value)}</span></span></a> })}</div>
        <footer>© {N(new Date().getFullYear())} {h.name}</footer>
      </section>
    </div>
  )
}
