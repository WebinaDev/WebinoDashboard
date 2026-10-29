"use client"

/* Full-page resume theme (round 4), data-driven from the Resume module:
 *   resume.page_fluent — «Fluent»: a cinematic language-classroom story.
 *   Metaphor: open lexicon → CEFR ladder → lesson chapters → diploma seal → enrol.
 *   Scroll engine: --p on [data-s] scenes (0→1 on entry); --h on pinned hero; GPU transforms only.
 *   Palettes (prop `palette`): ink (default), ochre, navy.
 *   Details: rising-word headline, phonetic eyebrow, tilted notebook portrait, vocabulary marquee,
 *   CEFR rung meter, dictionary skill cards, lesson-number experience lanes, TTC diploma badge +
 *   certificate image, office-hours contact. prefers-reduced-motion: final state, no motion. */

import { useEffect, useRef, useState, type CSSProperties } from "react"

import { faDigits, type ResumeDate } from "../../../modules/resume/lib/jalali"
import { optLabel, trList } from "../../../modules/resume/lib/schema"
import type { WidgetNode } from "../types"
import { helpers, short, useBase } from "./resume-pages"
import { ContactIcon } from "./resume-pages-2"
import { contactHref } from "./resume-widgets"
import "./resume-fonts.css"
import "./resume-fluent.css"
import { Img } from "./img"

type Row = Record<string, unknown> & { id: number }
type Lang = "fa" | "en"
const PROF_W: Record<string, number> = { native: 100, full: 90, professional: 78, limited: 50, elementary: 30 }
const PALETTES = ["ink", "ochre", "navy"] as const
const PAL_ACCENT: Record<string, string> = { ink: "#c45c26", ochre: "#b07a1a", navy: "#2a5f8f" }
const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"] as const
const fmt = (v: number, lang: Lang) => (lang === "fa" ? faDigits(v) : String(v))

function useFluent(root: React.RefObject<HTMLDivElement | null>, dep: unknown, lang: Lang) {
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
      const f = (t: number) => {
        const k = Math.min(1, (t - t0) / 1300), e = 1 - Math.pow(1 - k, 3)
        c.textContent = fmt(Math.round(to * e), lang) + suf
        if (k < 1) requestAnimationFrame(f)
      }
      requestAnimationFrame(f)
    }
    let io: IntersectionObserver | null = null
    if (rm || typeof IntersectionObserver === "undefined") { el.classList.add("still"); counters.forEach(tick) }
    else {
      io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { tick(e.target as HTMLElement); io?.unobserve(e.target) } }), { threshold: 0.55 })
      counters.forEach((c) => io!.observe(c))
    }
    let raf = 0
    const frame = () => {
      const vh = window.innerHeight
      if (!rm) {
        for (const s of scenes) {
          const r = s.getBoundingClientRect()
          if (r.bottom < -vh || r.top > vh * 2) continue
          s.style.setProperty("--p", Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.72))).toFixed(3))
        }
        if (stage) {
          const r = stage.getBoundingClientRect()
          if (r.height > vh * 1.2) stage.style.setProperty("--h", Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - vh))).toFixed(3))
        }
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
    const hero = el.querySelector<HTMLElement>(".pin")
    const move = (e: PointerEvent) => {
      if (!hero || e.pointerType !== "mouse") return
      const r = hero.getBoundingClientRect()
      hero.style.setProperty("--mx", `${e.clientX - r.left}px`)
      hero.style.setProperty("--my", `${e.clientY - r.top}px`)
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

function Rise({ text, lang, base = 0 }: { text: string; lang: Lang; base?: number }) {
  const parts = lang === "en" ? Array.from(text) : text.split(/(\s+)/)
  let k = base
  return <>{parts.map((ch, i) => /^\s+$/.test(ch) ? <span key={i}> </span> : <span key={i} className="ch" style={{ "--k": k++ } as CSSProperties}>{ch}</span>)}</>
}

const Ruled = () => (
  <svg className="ruled" aria-hidden viewBox="0 0 100 20" preserveAspectRatio="none">
    <line x1="0" y1="10" x2="100" y2="10" stroke="currentColor" strokeWidth="0.4" strokeDasharray="2 3" />
  </svg>
)

export function ResumeFluentPage({ widget }: { widget: WidgetNode }) {
  const { data, lang, accent: baseAccent, showPh, p } = useBase(widget, "fluent")
  const pal = PALETTES.includes(p.palette as never) ? (p.palette as string) : "ink"
  const customAcc = typeof data?.settings?.accent === "string" && data.settings.accent ? (data.settings.accent as string) : null
  const accent = (typeof p.palette === "string" ? PAL_ACCENT[pal] : customAcc) ?? baseAccent
  const root = useRef<HTMLDivElement>(null)
  const still = useFluent(root, data, lang)
  if (!data) return <div className="rzx-fluent" data-pal={pal} style={{ minHeight: "100vh" }} aria-busy="true" />
  const h = helpers(data, lang, showPh)
  const { L, N, T } = h
  const skills = h.keep(data.skills)
  const stats = h.keep(data.stats)
  const edus = h.keep(data.educations)
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
  const phonetic = h.EN ? "/sɑːˈnɑːz ɡæˈtæbi/" : "ساناز · گتابی"
  const nav: [string, string][] = [
    ["about", L("درباره", "About")], ["lessons", L("سوابق", "Lessons")], ["lexicon", L("واژگان", "Lexicon")],
    ["diploma", L("مدارک", "Diploma")], ["enrol", L("تماس", "Enrol")],
  ]
  const total = 1 + (exps.length || edus.length ? 1 : 0) + (highlights.length || skills.length ? 1 : 0) + (certs.length || honors.length ? 1 : 0)
  let n = 0
  const head = (k: string, a: string, b: string) => (
    <div className="sh" data-s>
      <span className="k"><b>{N(String(++n).padStart(2, "0"))}</b><i>/</i>{N(String(total).padStart(2, "0"))}<Ruled />{k}</span>
      <h2>{a}<em>{b}</em></h2>
    </div>
  )
  const Stat = ({ s }: { s: Row }) => {
    const raw = String(s.value ?? ""), m = raw.match(/^(\d+)(.*)$/)
    return m ? <b data-count={m[1]} data-suf={m[2]}>{N(m[1])}{m[2]}</b> : <b>{N(raw)}</b>
  }
  const skillRow = (rev: boolean) => (
    <div className={`row${rev ? " rev" : ""}`}>
      <div className="trk">{[0, 1].map((k) => (
        <span key={k} aria-hidden={k ? true : undefined}>
          {(rev ? [...skills].reverse() : skills).map((s) => (
            <span key={`${s.id}-${k}`} className="it"><i className="mark">§</i>{T(s, "name")}<i className="dot" /></span>
          ))}
        </span>
      ))}</div>
    </div>
  )
  const years = h.years ?? 13
  const cefrIdx = Math.min(CEFR.length - 1, Math.max(0, Math.round((years / 15) * (CEFR.length - 1))))

  return (
    <div ref={root} className={`rzx-fluent${still ? " still" : ""}`} data-pal={pal} dir={h.EN ? "ltr" : "rtl"} lang={lang} style={{ "--acc": accent } as CSSProperties}>
      <a className="skip" href="#about">{L("رفتن به محتوا", "Skip to content")}</a>
      <nav className="top">
        <a className="brand" href="#top">{h.first}<i>.</i></a>
        <ul>{nav.map(([id, l]) => <li key={id}><a href={`#${id}`}>{l}</a></li>)}</ul>
        <LangLink lang={lang} p={p} />
      </nav>
      <div className="gauge" aria-hidden><span>{L("پیشرفت", "Progress")}</span><b>{fmt(0, lang)}</b><i /></div>

      <div className="stage" id="top">
        <header className="pin">
          <div className="paper" aria-hidden>
            <div className="margin" />
            <div className="lines">{Array.from({ length: 18 }).map((_, i) => <i key={i} />)}</div>
            <div className="spot" />
            <div className="dust">{Array.from({ length: 14 }).map((_, i) => <i key={i} style={{ "--i": i } as CSSProperties} />)}</div>
          </div>
          <div className="back" aria-hidden>{h.EN ? "FLUENT" : "فلوئنت"}</div>
          <div className="htxt">
            <span className="eyebrow"><i />{phonetic}</span>
            {location ? <span className="loc">{location}</span> : null}
            <h1 aria-label={h.name}>
              <span className="l1" aria-hidden><Rise text={h.first} lang={lang} /></span>
              {h.last ? <em aria-hidden><Rise text={h.last} lang={lang} base={h.first.length} /></em> : null}
            </h1>
            <p className="lede">{T(h.id, "headline")}</p>
            <div className="cefr" aria-label="CEFR">
              {CEFR.map((lv, i) => <span key={lv} className={i <= cefrIdx ? "on" : ""} style={{ "--k": i } as CSSProperties}>{lv}</span>)}
            </div>
            <div className="cta">
              {h.primary ? <a className="btn" href="#enrol"><span>{L("شروع کلاس", "Book a lesson")}</span><i aria-hidden>{h.EN ? "→" : "←"}</i></a> : null}
              <a className="btn ghost" href="#about">{L("داستان من", "My story")}</a>
            </div>
          </div>
          <figure className="portrait">
            <div className="nb">
              <span className="spine" aria-hidden />
              <div className="page">
                {h.cutout ? <Img src={h.cutout} alt={h.name} priority /> : <span className="ph">{h.first.slice(0, 1)}</span>}
                <span className="tape t1" aria-hidden /><span className="tape t2" aria-hidden />
              </div>
            </div>
            {stats[0] ? <figcaption className="chip c1"><Stat s={stats[0]} /><span>{T(stats[0], "label")}</span></figcaption> : null}
            {stats[3] ? <figcaption className="chip c2"><Stat s={stats[3]} /><span>{T(stats[3], "label")}</span></figcaption> : null}
          </figure>
          <span className="cue" aria-hidden><i />{L("ورق بزن", "Turn the page")}</span>
        </header>
      </div>

      {skills.length ? <div className="vocab" aria-label={L("مهارت‌ها", "Skills")}>{skillRow(false)}{skillRow(true)}</div> : null}

      {body ? (
        <section className="z z1" id="about">
          {head(L("معرفی", "Profile"), L("درباره‌ی ", "About "), h.first)}
          {highlights.length ? (
            <ul className="hi" data-s>
              {highlights.map((x, i) => (
                <li key={x} style={{ "--k": i } as CSSProperties}>
                  <span className="def">{L("معنی", "def.")}</span>
                  <b>{x}</b>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="about" data-s>
            <blockquote>{sentences[0]}</blockquote>
            <div>
              <p>{sentences.slice(1).join(" ") || body}</p>
              {stats.length ? (
                <dl className="stats">{stats.slice(0, 4).map((s, i) => (
                  <div key={s.id} style={{ "--k": i } as CSSProperties}>
                    <dt><Stat s={s} /></dt>
                    <dd>{T(s, "label")}</dd>
                  </div>
                ))}</dl>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {exps.length || edus.length ? (
        <section className="z z2" id="lessons">
          {head(L("سوابق", "Experience"), L("فصل‌های ", "Lesson "), L("تدریس", "chapters"))}
          <ol className="lessons">
            {exps.map((x, i) => (
              <li className={`lesson${i % 2 ? " alt" : ""}`} key={x.id} data-s style={{ "--k": i } as CSSProperties}>
                <span className="no" aria-hidden>{L("درس", "Lesson")} {N(String(i + 1).padStart(2, "0"))}</span>
                <span className="yr">{yearOf(x)}</span>
                <div className="lb">
                  <h3>{T(x, "title")}</h3>
                  <div className="m">
                    <span className="co">{T(x, "company") || String(x.company ?? "")}</span>
                    <span>{range(x)}</span>
                    {x.is_current ? <span className="now">{L("فعلی", "Current")}</span> : null}
                  </div>
                  {T(x, "description") ? <p>{T(x, "description")}</p> : null}
                  {(Array.isArray(x.skill_ids) ? (x.skill_ids as number[]) : []).map(h.skillName).filter(Boolean).length ? (
                    <div className="tags">{(x.skill_ids as number[]).map(h.skillName).filter(Boolean).map((s) => <em key={s}>{s}</em>)}</div>
                  ) : null}
                </div>
                <span className="margin-note" aria-hidden>{CEFR[Math.min(CEFR.length - 1, i)]}</span>
              </li>
            ))}
          </ol>
          {edus.length ? (
            <div className="edus">
              {edus.map((e, i) => (
                <article className="edu" data-s key={e.id} style={{ "--k": i } as CSSProperties}>
                  <span className="badge">{L("تحصیلات", "Education")}</span>
                  <span className="yr">{range(e)}</span>
                  <h3>{T(e, "degree")}</h3>
                  <p className="f">{T(e, "field")}</p>
                  <p>{T(e, "school")}</p>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {highlights.length || skills.length || langs.length ? (
        <section className="z z3" id="lexicon">
          {head(L("تخصص", "Expertise"), L("واژه‌نامهٔ ", "Teaching "), L("تدریس", "lexicon"))}
          {skills.length ? (
            <div className="cards">
              {skills.map((s, i) => (
                <article className="card" data-s key={s.id} style={{ "--k": i, "--rot": `${((i % 5) - 2) * 1.4}deg` } as CSSProperties}>
                  <span className="entry">{h.EN ? "n." : "اسم"}</span>
                  <h3>{T(s, "name")}</h3>
                  <p className="pron" dir="ltr">/{String(T(s, "name")).toLowerCase().replace(/\s+/g, "-")}/</p>
                  <p className="sense">{L("مهارت کلیدی تدریس", "Core teaching skill")}</p>
                  <span className="num">{N(String(i + 1).padStart(2, "0"))}</span>
                </article>
              ))}
            </div>
          ) : null}
          {langs.length ? (
            <div className="langs" data-s>
              {langs.map((l, i) => (
                <div key={l.id} style={{ "--k": i } as CSSProperties}>
                  <b>{T(l, "name")}</b>
                  <small>{optLabel(String(l.proficiency), lang)}</small>
                  <span className="bar"><i style={{ "--w": `${PROF_W[String(l.proficiency)] ?? 50}%` } as CSSProperties} /></span>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {certs.length || honors.length ? (
        <section className="z z4" id="diploma">
          {head(L("مدارک", "Credentials"), L("دیپلم و ", "Diploma & "), L("افتخارات", "honours"))}
          <div className="creds">
            {certs.map((c, i) => {
              const img = (Array.isArray(c.media_ids) ? (c.media_ids as number[]) : []).map(h.media).find(Boolean)
              const sub = [T(c, "issuer"), c.issue_date ? h.DT(c.issue_date) : c.date ? h.DT(c.date) : ""].filter(Boolean).join(" · ")
              return (
                <article className={`cred${img ? " has" : ""}`} data-s key={c.id} style={{ "--k": i } as CSSProperties}>
                  <div className="seal" aria-hidden>
                    <b>A+</b>
                    <small>TTC</small>
                  </div>
                  <div className="body">
                    <h3>{T(c, "name")}</h3>
                    {sub ? <p>{sub}</p> : null}
                    {T(c, "description") ? <p className="mut">{T(c, "description")}</p> : null}
                    {c.credential_id ? <p className="id" dir="ltr">No. {String(c.credential_id)}</p> : null}
                  </div>
                  {img ? (
                    <a className="scan" href={img} target="_blank" rel="noopener noreferrer">
                      <Img src={img} alt={T(c, "name") || L("گواهی‌نامه TTC", "TTC certificate")} loading="lazy" />
                    </a>
                  ) : null}
                </article>
              )
            })}
            {honors.map((c, i) => (
              <article className="cred honor" data-s key={c.id} style={{ "--k": i + certs.length } as CSSProperties}>
                <span className="ix">{N(String(i + 1).padStart(2, "0"))}</span>
                <div className="body">
                  <h3>{T(c, "title") || T(c, "name")}</h3>
                  <p>{[T(c, "issuer") && T(c, "issuer") !== "ندارد" ? T(c, "issuer") : "", c.date ? h.DT(c.date) : ""].filter(Boolean).join(" · ") || "\u00a0"}</p>
                  {T(c, "description") ? <p className="mut">{T(c, "description")}</p> : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="z z5 contact" id="enrol">
        <div className="glow" aria-hidden>{Array.from({ length: 18 }).map((_, i) => <i key={i} style={{ "--i": i } as CSSProperties} />)}</div>
        <h2 data-s>{L("ساعت ", "Office ")}<em>{L("مشاوره", "hours")}</em></h2>
        <p className="lede2" data-s>{L("برای شروع یک مسیر یادگیری تازه، همین حالا پیام بده.", "Ready for a new learning chapter? Reach out now.")}</p>
        <div className="cl" data-s>
          {h.contacts.map((c, i) => {
            const href = contactHref(String(c.type), String(c.value))
            return (
              <a key={c.id} style={{ "--k": i } as CSSProperties} href={href} target={/^(tel|mailto):/.test(href) ? undefined : "_blank"} rel="noopener noreferrer me">
                <ContactIcon type={String(c.type)} />
                <span><small>{T(c, "label") || optLabel(String(c.type), lang)}</small><span dir="ltr">{short(c.value)}</span></span>
                <i className="ar" aria-hidden>↗</i>
              </a>
            )
          })}
        </div>
        <footer>
          <span>© {N(new Date().getFullYear())} {h.name}</span>
          <a href="#top">{L("بازگشت به بالا", "Back to top")} ↑</a>
        </footer>
      </section>
    </div>
  )
}
