"use client"

/* Full-page resume theme (round 3), data-driven from the Resume module:
 *   resume.page_tide — «Tide»: a cinematic dive from a sunlit surface into the deep.
 *   Scroll engine: every [data-s] scene gets --p (0 → 1 as it enters), the pinned hero gets --h (0 → 1 while it is pinned);
 *   all scrubbed motion is pure CSS calc() on those two variables (GPU transforms / opacity only, no layout shift).
 *   Palettes (prop `palette`): rose (default), plum, teal. Each one retunes every depth layer, not just the accent.
 *   Details: rising-word headline, cursor spotlight and ripples on the hero, full (uncropped) arch portrait, giant outlined
 *   name, tilted double skills current (marquee), scrubbed word-by-word manifesto, swim lanes racing in with giant outlined
 *   years, orbitals converging into morphing cells, ticking counters, floating book covers, surfacing certificates,
 *   bioluminescent contact. prefers-reduced-motion: everything settles in its final state and nothing moves. */

import { useEffect, useRef, useState, type CSSProperties } from "react"

import { faDigits, type ResumeDate } from "../../../modules/resume/lib/jalali"
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
const PALETTES = ["rose", "plum", "teal"] as const
const PAL_ACCENT: Record<string, string> = { rose: "#a8436a", plum: "#6a3d8c", teal: "#2a7f86" }
const fmt = (v: number, lang: Lang) => (lang === "fa" ? faDigits(v) : String(v))

function useTide(root: React.RefObject<HTMLDivElement | null>, dep: unknown, lang: Lang) {
  const [still, setStill] = useState(false)
  useEffect(() => {
    const el = root.current
    if (!el) return
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches || navigator.webdriver
    setStill(rm)
    const scenes = Array.from(el.querySelectorAll<HTMLElement>("[data-s]"))
    const stage = el.querySelector<HTMLElement>(".stage")
    const gauge = el.querySelector<HTMLElement>(".gauge b")
    const counters = Array.from(el.querySelectorAll<HTMLElement>("[data-count]"))
    const tick = (c: HTMLElement) => {
      const to = Number(c.dataset.count), suf = c.dataset.suf ?? ""
      if (rm) { c.textContent = fmt(to, lang) + suf; return }
      const t0 = performance.now()
      const f = (t: number) => { const k = Math.min(1, (t - t0) / 1400), e = 1 - Math.pow(1 - k, 3); c.textContent = fmt(Math.round(to * e), lang) + suf; if (k < 1) requestAnimationFrame(f) }
      requestAnimationFrame(f)
    }
    let io: IntersectionObserver | null = null
    if (rm || typeof IntersectionObserver === "undefined") { el.classList.add("still"); counters.forEach(tick) }
    else {
      io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { tick(e.target as HTMLElement); io?.unobserve(e.target) } }), { threshold: 0.6 })
      counters.forEach((c) => io!.observe(c))
    }
    let raf = 0
    const frame = () => {
      const vh = window.innerHeight
      if (!rm) {
        for (const s of scenes) {
          const r = s.getBoundingClientRect()
          if (r.bottom < -vh || r.top > vh * 2) continue
          s.style.setProperty("--p", Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.75))).toFixed(3))
        }
        if (stage) { const r = stage.getBoundingClientRect(); if (r.height > vh * 1.3) stage.style.setProperty("--h", Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - vh))).toFixed(3)) }
      }
      const max = Math.max(1, el.scrollHeight - vh)
      const sp = Math.min(1, Math.max(0, (window.scrollY - (el.getBoundingClientRect().top + window.scrollY)) / max))
      el.style.setProperty("--sp", sp.toFixed(4))
      if (gauge) gauge.textContent = fmt(Math.round(sp * 100), lang)
    }
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame) }
    frame()
    window.addEventListener("scroll", on, { passive: true })
    window.addEventListener("resize", on)
    /* cursor light + ripples on the hero (fine pointers only) */
    const hero = el.querySelector<HTMLElement>(".pin")
    let last = 0
    const move = (e: PointerEvent) => {
      if (!hero || e.pointerType !== "mouse") return
      const r = hero.getBoundingClientRect()
      hero.style.setProperty("--mx", `${e.clientX - r.left}px`); hero.style.setProperty("--my", `${e.clientY - r.top}px`)
      const now = performance.now()
      if (now - last < 140) return
      last = now
      const d = document.createElement("i"); d.className = "rip"; d.style.left = `${e.clientX - r.left}px`; d.style.top = `${e.clientY - r.top}px`
      hero.appendChild(d); window.setTimeout(() => d.remove(), 1600)
    }
    if (hero && !rm && window.matchMedia("(pointer: fine)").matches) hero.addEventListener("pointermove", move)
    return () => { io?.disconnect(); window.removeEventListener("scroll", on); window.removeEventListener("resize", on); hero?.removeEventListener("pointermove", move); cancelAnimationFrame(raf) }
  }, [root, dep, lang])
  return still
}

function LangLink({ lang, p }: { lang: Lang; p: Record<string, unknown> }) {
  const fa = typeof p.fa_href === "string" ? p.fa_href : "/"
  const en = typeof p.en_href === "string" ? p.en_href : "/en"
  return <a className="lang" href={lang === "fa" ? en : fa} hrefLang={lang === "fa" ? "en" : "fa"}>{lang === "fa" ? "EN" : "فا"}</a>
}

function Caustics() {
  return (
    <svg className="caus" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs><filter id="tdC" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="2" seed="7" result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -2.6 1.55" />
      </filter></defs>
      <rect width="800" height="500" filter="url(#tdC)" />
    </svg>
  )
}

/* Rising words (fa keeps words whole so letters stay joined; en rises letter by letter). */
function Rise({ text, lang, base = 0 }: { text: string; lang: Lang; base?: number }) {
  const parts = lang === "en" ? Array.from(text) : text.split(/(\s+)/)
  let k = base
  return <>{parts.map((ch, i) => /^\s+$/.test(ch) ? <span key={i}> </span> : <span key={i} className="ch" style={{ "--k": k++ } as CSSProperties}>{ch}</span>)}</>
}

const BLOBS = [
  "M40 8C58 8 72 22 72 40S58 72 40 72 8 58 8 40 22 8 40 8Z",
  "M42 6C62 9 74 24 71 43S53 75 36 72 6 57 9 37 24 4 42 6Z",
  "M38 7C57 5 75 20 73 41S56 74 39 73 7 60 8 40 19 9 38 7Z",
]
function Cell({ i, still }: { i: number; still: boolean }) {
  const a = BLOBS[i % 3], b = BLOBS[(i + 1) % 3]
  return (
    <svg viewBox="0 0 80 80" aria-hidden className="cellsvg">
      <path className="m" d={a}>{still ? null : <animate attributeName="d" dur={`${9 + (i % 3) * 2}s`} repeatCount="indefinite" values={`${a};${b};${a}`} calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1" />}</path>
      <circle cx="40" cy="40" r="24" className="c" />
      <circle cx={35 + (i % 3) * 4} cy={36 + (i % 2) * 6} r="9" className="n" />
      <circle cx="56" cy="30" r="2.2" className="o" /><circle cx="26" cy="54" r="1.6" className="o" /><circle cx="54" cy="56" r="1.2" className="o" />
    </svg>
  )
}

const Wave = ({ cls }: { cls: string }) => (
  <svg className={`wv ${cls}`} viewBox="0 0 1440 80" preserveAspectRatio="none" aria-hidden><path d="M0 40 C180 0 360 80 540 40 S900 0 1080 40 S1260 80 1440 40 V80 H0Z" /></svg>
)
const Orn = () => <svg className="orn" viewBox="0 0 120 12" aria-hidden><path d="M0 6 Q10 0 20 6 T40 6 T60 6 T80 6 T100 6 T120 6" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>

export function ResumeTidePage({ widget }: { widget: WidgetNode }) {
  const { data, lang, accent: baseAccent, showPh, p } = useBase(widget, "tide")
  const pal = PALETTES.includes(p.palette as never) ? (p.palette as string) : "rose"
  const customAcc = typeof data?.settings?.accent === "string" && data.settings.accent ? (data.settings.accent as string) : null
  const accent = (typeof p.palette === "string" ? PAL_ACCENT[pal] : customAcc) ?? baseAccent
  const root = useRef<HTMLDivElement>(null)
  const still = useTide(root, data, lang)
  if (!data) return <div className="rzx-tide" data-pal={pal} style={{ minHeight: "100vh" }} aria-busy="true" />
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
  const yearOf = (r: Row) => { const d = r.start as ResumeDate | null; return h.EN ? String(d?.g ?? "").slice(0, 4) : faDigits(String(d?.j ?? "").slice(0, 4)) }
  const location = T(h.id, "location")
  const nav: [string, string][] = [
    ["about", L("درباره", "About")], ["lanes", L("سوابق", "Experience")], ["focus", L("تمرکز", "Focus")],
    ["library", L("آثار", "Works")], ["cred", L("مدارک", "Credentials")], ["contact", L("تماس", "Contact")],
  ]
  const total = 1 + (exps.length || edus.length ? 1 : 0) + (highlights.length || skills.length ? 1 : 0) + (pubs.length ? 1 : 0) + (certs.length || honors.length ? 1 : 0)
  let n = 0
  const head = (k: string, a: string, b: string) => (
    <div className="sh" data-s><span className="k"><b>{N(String(++n).padStart(2, "0"))}</b><i>/</i>{N(String(total).padStart(2, "0"))}<Orn />{k}</span><h2>{a}<em>{b}</em></h2></div>
  )
  const Stat = ({ s }: { s: Row }) => {
    const raw = String(s.value ?? ""), m = raw.match(/^(\d+)(.*)$/)
    return m ? <b data-count={m[1]} data-suf={m[2]}>{N(m[1])}{m[2]}</b> : <b>{N(raw)}</b>
  }
  const skillRow = (rev: boolean) => (
    <div className={`row${rev ? " rev" : ""}`}><div className="trk">{[0, 1].map((k) => <span key={k} aria-hidden={k ? true : undefined}>{(rev ? [...skills].reverse() : skills).map((s) => <span key={s.id} className="it">{T(s, "name")}<i className="dot" /></span>)}</span>)}</div></div>
  )
  return (
    <div ref={root} className="rzx-tide" data-pal={pal} dir={h.EN ? "ltr" : "rtl"} lang={lang} style={{ "--acc": accent } as CSSProperties}>
      <a className="skip" href="#about">{L("رفتن به محتوا", "Skip to content")}</a>
      <nav className="top"><a className="brand" href="#top">{h.first}<i>.</i></a>
        <ul>{nav.map(([id, l]) => <li key={id}><a href={`#${id}`}>{l}</a></li>)}</ul><LangLink lang={lang} p={p} /></nav>
      <div className="gauge" aria-hidden><span>{L("پیشرفت", "Progress")}</span><b>{fmt(0, lang)}</b><i /></div>

      <div className="stage" id="top">
        <header className="pin">
          <div className="sky" aria-hidden><Caustics /><div className="rays"><i /><i /><i /><i /></div><div className="spot" /></div>
          <div className="back" aria-hidden>{h.EN ? h.first.toUpperCase() : h.first}</div>
          <div className="bubbles" aria-hidden>{Array.from({ length: 12 }).map((_, i) => <i key={i} style={{ "--i": i } as CSSProperties} />)}</div>
          <div className="htxt">
            {location ? <span className="eyebrow"><i />{location}</span> : null}
            <h1 aria-label={h.name}><span className="l1" aria-hidden><Rise text={h.first} lang={lang} /></span>{h.last ? <em aria-hidden><Rise text={h.last} lang={lang} base={h.first.length} /></em> : null}</h1>
            <p className="lede">{T(h.id, "headline")}</p>
            <div className="cta">
              {h.primary ? <a className="btn" href="#contact"><span>{L("تماس", "Contact")}</span><i aria-hidden>{h.EN ? "→" : "←"}</i></a> : null}
              <a className="btn ghost" href="#about">{L("مشاهده‌ی سوابق", "View profile")}</a>
            </div>
          </div>
          <figure className="portrait">
            <div className="halo" /><div className="arch-ring" />
            <div className="frame">{h.cutout ? <img src={h.cutout} alt={h.name} fetchPriority="high" /> : <span className="ph">{h.first.slice(0, 1)}</span>}<span className="shine" /></div>
            <div className="ripples" aria-hidden><i /><i /><i /></div>
            {stats[0] ? <figcaption className="chip c1"><Stat s={stats[0]} />{T(stats[0], "label")}</figcaption> : null}
            {edus[0] ? <figcaption className="chip c2"><b>{T(edus[0], "degree")}</b>{T(edus[0], "field").replace(/\s*\(.*\)/, "")}</figcaption> : null}
          </figure>
          <div className="surface" aria-hidden><Wave cls="w1" /><Wave cls="w2" /></div>
          <span className="cue" aria-hidden><i />{L("ادامه", "Scroll down")}</span>
        </header>
      </div>

      {skills.length ? <div className="current" aria-label={L("مهارت‌ها", "Skills")}>{skillRow(false)}{skillRow(true)}</div> : null}

      {body ? (
        <section className="z z1" id="about">{head(L("معرفی", "Profile"), L("درباره‌ی ", "About "), h.first)}
          {highlights.length ? (
            <p className="man" data-s>{highlights.map((x, i) => { const w = x.split(" "); return <span className="ln" key={i} style={{ "--k": i } as CSSProperties}>{w.slice(0, -1).join(" ")}{w.length > 1 ? " " : ""}<em>{w[w.length - 1]}</em><i className="sep" aria-hidden>{i < highlights.length - 1 ? "◦" : ""}</i>{" "}</span> })}</p>
          ) : null}
          <div className="about" data-s>
            <blockquote>{sentences[0]}</blockquote>
            <div><p>{sentences.slice(1).join(" ") || body}</p>
              {stats.length ? <dl className="stats">{stats.slice(0, 4).map((s, i) => <div key={s.id} style={{ "--k": i } as CSSProperties}><dt><Stat s={s} /></dt><dd>{T(s, "label")}</dd><span className="drop" aria-hidden /></div>)}</dl> : null}</div>
          </div>
        </section>
      ) : null}

      {exps.length || edus.length ? (
        <section className="z z2" id="lanes">{head(L("سوابق", "Experience"), L("سوابق ", "Professional "), L("حرفه‌ای", "experience"))}
          <ol className="lanes">{exps.map((x, i) => (
            <li className={`lane${i % 3 === 1 ? " hot" : ""}`} key={x.id} data-s style={{ "--k": i, "--dir": i % 2 ? -1 : 1 } as CSSProperties}>
              <span className="yr" aria-hidden>{yearOf(x)}</span>
              <span className="no">{N(String(i + 1).padStart(2, "0"))}</span>
              <div className="lb"><h3>{T(x, "title")}</h3>
                <div className="m"><span className="co">{T(x, "company")}</span><span>{range(x)}</span>{x.is_current ? <span className="now">{L("فعلی", "Current")}</span> : null}</div>
                {T(x, "description") ? <p>{T(x, "description")}</p> : null}
                {(Array.isArray(x.skill_ids) ? (x.skill_ids as number[]) : []).map(h.skillName).filter(Boolean).length ? <div className="tags">{(x.skill_ids as number[]).map(h.skillName).filter(Boolean).map((s) => <em key={s}>{s}</em>)}</div> : null}</div>
              <span className="rope" aria-hidden /><span className="swimmer" aria-hidden />
            </li>))}</ol>
          {edus.length ? <div className="edus">{edus.map((e, i) => (
            <article className="edu" data-s key={e.id} style={{ "--k": i } as CSSProperties}><span className="yr2" aria-hidden>{yearOf(e)}</span><span className="yr">{range(e)}</span><h3>{T(e, "degree")}</h3><p className="f">{T(e, "field")}</p><p>{T(e, "school")}</p>{T(e, "description") ? <p className="mut">{T(e, "description")}</p> : null}</article>))}</div> : null}
        </section>
      ) : null}

      {highlights.length || skills.length ? (
        <section className="z z3" id="focus">{head(L("تخصص", "Expertise"), L("حوزه‌های ", "Areas of "), L("تخصص", "expertise"))}
          {highlights.length ? <div className="cells">{highlights.map((x, i) => (
            <div className="cell" data-s key={x} style={{ "--k": i, "--ox": `${((i * 37) % 60) - 30}px`, "--oy": `${((i * 53) % 80) + 40}px` } as CSSProperties}>
              <span className="orb" aria-hidden><i /><i /><i /></span><Cell i={i} still={still} /><b>{x}</b><small>{N(String(i + 1).padStart(2, "0"))}</small></div>))}</div> : null}
          {langs.length ? <div className="langs" data-s>{langs.map((l, i) => <div key={l.id} style={{ "--k": i } as CSSProperties}><b>{T(l, "name")}</b><small>{optLabel(String(l.proficiency), lang)}</small><span className="bar"><i style={{ "--w": `${PROF_W[String(l.proficiency)] ?? 50}%` } as CSSProperties} /></span></div>)}</div> : null}
        </section>
      ) : null}

      {pubs.length ? (
        <section className="z z4" id="library"><Wave cls="edge" />{head(L("انتشارات", "Publications"), L("کتاب‌ها و ", "Books & "), L("ترجمه‌ها", "translations"))}
          <div className="books">{pubs.map((b, i) => {
            const cover = h.media(b.cover_media_id)
            const links = (Array.isArray(b.links) ? (b.links as Record<string, unknown>[]) : []).filter((l) => typeof l?.url === "string" && l.url)
            const authors = trList(b, "co_authors", lang)
            const meta = [T(b, "publisher"), b.date ? h.DT(b.date) : "", b.isbn ? `ISBN ${N(String(b.isbn))}` : ""].filter(Boolean)
            return (
              <article className="book" data-s key={b.id} style={{ "--k": i } as CSSProperties}>
                <div className="float"><a className="cover" href={links[0] ? String(links[0].url) : String(b.url || cover || "#")} target="_blank" rel="noopener noreferrer">
                  {cover ? <img src={cover} alt={T(b, "title")} loading="lazy" /> : <span className="nocov">{T(b, "title").slice(0, 1)}</span>}<span className="gloss" /></a><span className="shadow" /></div>
                <div className="bb"><small><span>{N(String(i + 1).padStart(2, "0"))}</span>{optLabel(String(b.kind ?? "book"), lang)}</small><h3>{T(b, "title")}</h3>
                  {authors.length ? <p className="au">{L("نویسندگان: ", "By ")}{authors.join(L("، ", ", "))}</p> : null}
                  {T(b, "description") ? <p>{T(b, "description")}</p> : null}
                  {meta.length ? <p className="mut">{meta.join(" · ")}</p> : null}
                  {links.length ? <div className="bl">{links.map((l, j) => <a key={j} className={j === 0 ? "pri" : ""} href={String(l.url)} target="_blank" rel="noopener noreferrer">{String((lang === "en" ? l.label_en : l.label_fa) || l.label_en || l.label_fa || short(l.url))}<span aria-hidden>↗</span></a>)}</div>
                    : b.url ? <div className="bl"><a className="pri" href={String(b.url)} target="_blank" rel="noopener noreferrer">{short(b.url)}<span aria-hidden>↗</span></a></div> : null}
                </div>
              </article>)
          })}</div>
        </section>
      ) : null}

      {certs.length || honors.length ? (
        <section className="z z5" id="cred">{head(L("مدارک", "Credentials"), L("گواهی‌نامه‌ها و ", "Certifications & "), L("افتخارات", "honors"))}
          <div className="certs">{[...certs, ...honors].map((c, i) => {
            const img = (Array.isArray(c.media_ids) ? (c.media_ids as number[]) : []).map(h.media).find(Boolean)
            const sub = [T(c, "issuer"), c.issue_date ? h.DT(c.issue_date) : c.date ? h.DT(c.date) : ""].filter(Boolean).join(" · ")
            return (
              <article className={`cert${img ? " has" : ""}`} data-s key={`${c.id}-${i}`} style={{ "--k": i % 3 } as CSSProperties}>
                {img ? <a className="th" href={img} target="_blank" rel="noopener noreferrer"><img src={img} alt={T(c, "name") || T(c, "title")} loading="lazy" /></a> : <span className="ix">{N(String(i + 1).padStart(2, "0"))}</span>}
                <div><h3>{T(c, "name") || T(c, "title")}</h3>{sub ? <p>{sub}</p> : null}{c.credential_id ? <p className="id" dir="ltr">ID {String(c.credential_id)}</p> : null}</div>
                <span className="seal" aria-hidden />
              </article>)
          })}</div>
        </section>
      ) : null}

      <section className="z z6 contact" id="contact">
        <div className="glow" aria-hidden>{Array.from({ length: 22 }).map((_, i) => <i key={i} style={{ "--i": i } as CSSProperties} />)}</div>
        <div className="jelly" aria-hidden><svg viewBox="0 0 120 160"><path d="M10 60 C10 20 110 20 110 60 C110 70 100 72 90 68 C80 74 70 70 60 74 C50 70 40 74 30 68 C20 72 10 70 10 60Z" /><path className="t" d="M30 70 C26 100 36 120 30 150 M50 72 C46 104 56 124 50 156 M70 72 C74 104 64 124 70 156 M90 70 C94 100 84 120 90 150" /></svg></div>
        <h2 data-s>{L("راه‌های ", "Contact ")}<em>{L("ارتباط", "information")}</em></h2>
        <div className="cl" data-s>{h.contacts.map((c, i) => { const href = contactHref(String(c.type), String(c.value)); return <a key={c.id} style={{ "--k": i } as CSSProperties} href={href} target={/^(tel|mailto):/.test(href) ? undefined : "_blank"} rel="noopener noreferrer me"><ContactIcon type={String(c.type)} /><span><small>{T(c, "label") || optLabel(String(c.type), lang)}</small><span dir="ltr">{short(c.value)}</span></span><i className="ar" aria-hidden>↗</i></a> })}</div>
        <footer><span>© {N(new Date().getFullYear())} {h.name}</span><a href="#top">{L("بازگشت به بالا", "Back to top")} ↑</a></footer>
      </section>
    </div>
  )
}
