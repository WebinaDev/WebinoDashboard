"use client"

/* resume.page_doodle — notebook doodle full-page theme. Story-style FA/EN pill. */

import { useEffect, useRef, type CSSProperties } from "react"

import { type ResumeDate } from "../../../modules/resume/lib/jalali"
import { optLabel, trList } from "../../../modules/resume/lib/schema"
import type { WidgetNode } from "../types"
import { helpers, short, useBase } from "./resume-pages"
import { contactHref } from "./resume-widgets"
import "./resume-fonts.css"
import "./resume-doodle.css"
import { Img } from "./img"

type Row = Record<string, unknown> & { id: number }
type Lang = "fa" | "en"

function LangSw({ lang, p }: { lang: Lang; p: Record<string, unknown> }) {
  const fa = typeof p.fa_href === "string" ? p.fa_href : "/"
  const en = typeof p.en_href === "string" ? p.en_href : "/en"
  return (
    <div className="lsw" role="navigation" aria-label={lang === "fa" ? "زبان" : "Language"}>
      <a href={fa} hrefLang="fa" className={lang === "fa" ? "on" : ""} aria-current={lang === "fa" ? "page" : undefined}>فا</a>
      <a href={en} hrefLang="en" className={lang === "en" ? "on" : ""} aria-current={lang === "en" ? "page" : undefined}>EN</a>
    </div>
  )
}

const Icon = {
  star: (<svg viewBox="0 0 40 40" aria-hidden><path d="M20 4l4.2 11.2H36l-9.2 6.8 3.5 11L20 26.8 9.7 33l3.5-11L4 15.2h11.8z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>),
  book: (<svg viewBox="0 0 48 40" aria-hidden><path d="M6 8c6-4 12-4 18 0v26c-6-3-12-3-18 0V8zm18 0c6-4 12-4 18 0v26c-6-3-12-3-18 0V8z" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M24 8v26" stroke="currentColor" strokeWidth="1.6" /></svg>),
  bubble: (<svg viewBox="0 0 52 40" aria-hidden><path d="M8 6h30a8 8 0 018 8v10a8 8 0 01-8 8H20l-10 8v-8H8a8 8 0 01-8-8V14a8 8 0 018-8z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="16" cy="19" r="1.6" fill="currentColor" /><circle cx="24" cy="19" r="1.6" fill="currentColor" /><circle cx="32" cy="19" r="1.6" fill="currentColor" /></svg>),
  abc: (<svg viewBox="0 0 60 36" aria-hidden><text x="2" y="26" fontFamily="Georgia,serif" fontSize="22" fill="none" stroke="currentColor" strokeWidth="1.2">ABC</text></svg>),
  heart: (<svg viewBox="0 0 36 34" aria-hidden><path d="M18 30S4 20 4 12a8 8 0 0114-5 8 8 0 0114 5c0 8-14 18-14 18z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>),
}

function useReveal(root: React.RefObject<HTMLDivElement | null>, dep: unknown) {
  useEffect(() => {
    const el = root.current
    if (!el) return
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches || navigator.webdriver
    if (rm || typeof IntersectionObserver === "undefined") { el.classList.add("still"); return }
    const io = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target) } }), { threshold: 0.12, rootMargin: "0px 0px -8% 0px" })
    el.querySelectorAll("[data-r]").forEach((n) => io.observe(n))
    return () => io.disconnect()
  }, [root, dep])
}

export function ResumeDoodlePage({ widget }: { widget: WidgetNode }) {
  const { data, lang, accent, showPh, p } = useBase(widget, "doodle")
  const root = useRef<HTMLDivElement>(null)
  useReveal(root, data)
  const seo = (data?.settings?.seo && typeof data.settings.seo === "object" ? data.settings.seo : {}) as Record<string, unknown>
  const cvUrl = (typeof p.cv_url === "string" && p.cv_url) || (typeof seo.cv_url === "string" && seo.cv_url) || null
  if (!data) return <div className="rzx-doodle" style={{ minHeight: "100vh" }} aria-busy="true" />
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
  const quote = highlights[0] || T(h.id, "headline")
  const exps = [...h.exps].reverse()
  const range = (r: Row) => `${h.DT(r.start)} — ${r.is_current || !r.end ? L("اکنون", "Present") : h.DT(r.end)}`
  const avatar = h.media(h.id.avatar_media_id) ?? h.cutout
  const location = T(h.id, "location")
  const yearLabel = h.EN ? String(new Date().getFullYear()) : N(new Date().getFullYear() - 621)
  const nav: [string, string][] = [
    ["about", L("معرفی", "About")], ["exp", L("سوابق", "Experience")], ["skills", L("مهارت‌ها", "Skills")],
    ["creds", L("مدارک", "Credentials")], ["contact", L("تماس", "Contact")],
  ]
  const Stat = ({ s }: { s: Row }) => <b>{N(String(s.value ?? ""))}</b>

  return (
    <div ref={root} className="rzx-doodle" dir={h.EN ? "ltr" : "rtl"} lang={lang} style={{ "--acc": accent } as CSSProperties}>
      <a className="skip" href="#main">{L("رفتن به محتوا", "Skip to content")}</a>
      <nav className="top">
        <a className="brand" href="#top">
          {avatar ? <Img src={avatar} alt={h.name} /> : <span className="ph" aria-hidden>{h.first.slice(0, 1)}</span>}
          <span>{h.name}</span>
        </a>
        <ul>{nav.map(([id, l]) => <li key={id}><a href={`#${id}`}>{l}</a></li>)}</ul>
        <div className="top-actions">
          <LangSw lang={lang} p={p} />
          {cvUrl ? <a className="btn sm" href={cvUrl} download target="_blank" rel="noopener noreferrer">{L("دانلود رزومه", "Download CV")}</a> : null}
        </div>
      </nav>
      <main id="main">
        <header className="hero" id="top">
          <span className="scribble s1" aria-hidden>{Icon.star}</span>
          <span className="scribble s2" aria-hidden>{Icon.bubble}</span>
          <span className="scribble s3" aria-hidden>{Icon.book}</span>
          <div data-r>
            <div className="eyebrow">{Icon.abc} {h.EN ? "English · paper & ink" : "English · با مهر و کاغذ"}</div>
            <h1>{h.first} {h.last ? <em>{h.last}</em> : null}</h1>
            <p className="role">{T(h.id, "headline")?.split(/[·•|]/)[0]?.trim() || L("مدرس زبان انگلیسی", "English Language Instructor")}</p>
            <p className="lede">{body ? body.slice(0, h.EN ? 180 : 140) + (body.length > (h.EN ? 180 : 140) ? "…" : "") : T(h.id, "headline")}</p>
            <div className="cta">
              {cvUrl ? <a className="btn" href={cvUrl} download target="_blank" rel="noopener noreferrer">{L("دانلود رزومه", "Download CV")}</a> : null}
              {h.primary ? <a className="btn ghost" href="#contact">{L("راه‌های تماس", "Get in touch")}</a> : null}
              <a className="btn ghost" href="#about">{L("داستان من", "My story")}</a>
            </div>
          </div>
          <div className="portrait" data-r style={{ "--d": ".15s" } as CSSProperties}>
            <span className="tape" aria-hidden />
            <div className="frame">{h.cutout ? <Img src={h.cutout} alt={h.name} priority /> : <span className="ph">{h.first.slice(0, 1)}</span>}</div>
            {stats[0] ? <div className="chip"><Stat s={stats[0]} /><small>{T(stats[0], "label")}</small></div> : h.years ? <div className="chip"><b>{N(h.years)}+</b><small>{L("سال تدریس", "years teaching")}</small></div> : null}
            <span className="margin-doodle" aria-hidden>{Icon.heart}</span>
          </div>
        </header>

        {(body || highlights.length) ? (
          <section id="about">
            <div className="sh" data-r>{Icon.bubble}<h2>{L("معرفی ", "About ")}<span>{L("کوتاه", "me")}</span></h2></div>
            <div className="about-grid">
              {quote ? <blockquote className="quote" data-r>«{quote}»</blockquote> : null}
              <div data-r style={{ "--d": ".1s" } as CSSProperties}>
                {body ? <p>{body}</p> : null}
                {stats.length ? <div className="stats">{stats.slice(0, 3).map((s) => <div className="stat" key={s.id}><Stat s={s} /><small>{T(s, "label")}</small></div>)}</div> : null}
              </div>
            </div>
          </section>
        ) : null}

        {exps.length ? (
          <section id="exp">
            <div className="sh" data-r>{Icon.book}<h2>{L("فصل‌های ", "Teaching ")}<span>{L("تدریس", "chapters")}</span></h2></div>
            <div className="jobs">
              {exps.map((x, i) => (
                <article className="job" key={x.id} data-r style={{ "--d": `${i * 0.08}s` } as CSSProperties}>
                  <span className="margin-note">{range(x)}</span>
                  <div className="job-card">
                    <h3>{T(x, "title")}</h3>
                    <p className="co">{T(x, "company") || String(x.company ?? "") || "\u00a0"}</p>
                    {T(x, "description") ? <p>{T(x, "description")}</p> : null}
                    {(Array.isArray(x.skill_ids) ? (x.skill_ids as number[]) : []).map(h.skillName).filter(Boolean).length ? (
                      <div className="tags">{(x.skill_ids as number[]).map(h.skillName).filter(Boolean).map((s) => <em key={s}>{s}</em>)}</div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {skills.length || langs.length ? (
          <section id="skills">
            <div className="sh" data-r>{Icon.star}<h2>{L("مهارت‌های ", "Key ")}<span>{L("کلیدی", "skills")}</span></h2></div>
            {skills.length ? <ul className="skills">{skills.map((s, i) => <li key={s.id} data-r style={{ "--d": `${i * 0.05}s` } as CSSProperties}>{Icon.star}{T(s, "name")}</li>)}</ul> : null}
            {langs.length ? (
              <div className="langs" data-r style={{ marginTop: 36 }}>
                <h3>{L("زبان‌ها", "Languages")}</h3>
                {langs.map((l) => <div key={l.id}><span>{T(l, "name")}</span><small>{optLabel(String(l.proficiency), lang)}</small></div>)}
              </div>
            ) : null}
          </section>
        ) : null}

        {edus.length || honors.length || certs.length ? (
          <section id="creds">
            <div className="sh" data-r>{Icon.star}<h2>{L("تحصیلات و ", "Education & ")}<span>{L("افتخارات", "honours")}</span></h2></div>
            <div className="two">
              <div>
                {edus.map((e) => (
                  <div className="edu" key={e.id} data-r style={{ marginBottom: 18 }}>
                    <div className="yr">{range(e)}</div>
                    <h3>{T(e, "degree")}</h3>
                    <p>{[T(e, "field"), T(e, "school")].filter(Boolean).join(" · ")}</p>
                  </div>
                ))}
                {honors.length ? (
                  <div className="honor-box" data-r>
                    <h3 style={{ marginBottom: 14, fontSize: 18 }}>{L("افتخارات", "Honours")}</h3>
                    <ul className="honors">
                      {honors.map((ho) => {
                        const d = ho.date as ResumeDate | null | undefined
                        const yr = d ? (h.EN ? String(d.g ?? "").slice(0, 4) : N(String(d.j ?? "").slice(0, 4))) : ""
                        return (
                          <li key={ho.id} data-r>
                            <b>{yr || "—"}</b>
                            <div>
                              <strong>{T(ho, "title") || T(ho, "name")}</strong>
                              {T(ho, "description") ? <p>{T(ho, "description")}</p> : null}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ) : null}
              </div>
              <div>
                {certs.map((c) => {
                  const img = (Array.isArray(c.media_ids) ? (c.media_ids as number[]) : []).map(h.media).find(Boolean)
                  const sub = [T(c, "issuer"), c.issue_date ? h.DT(c.issue_date) : c.date ? h.DT(c.date) : "", c.credential_id ? `${L("شماره", "No.")} ${c.credential_id}` : ""].filter(Boolean).join(" · ")
                  return (
                    <div className="cert" key={c.id} data-r>
                      <div className="cert-grid">
                        <div>
                          <div className="badge-a"><b>A+</b><small>TTC</small></div>
                          {c.issue_date || c.date ? <div className="yr">{h.DT(c.issue_date || c.date)}</div> : null}
                          <h3>{T(c, "name")}</h3>
                          {sub ? <p style={{ fontSize: 14 }}>{sub}</p> : null}
                        </div>
                        {img ? <Img src={img} alt={T(c, "name") || L("گواهی‌نامه TTC", "TTC certificate")} loading="lazy" /> : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        ) : null}

        <section className="contact" id="contact">
          <div className="sh" data-r><h2>{L("بیایید ", "Let's ")}<span>{L("شروع کنیم", "begin")}</span></h2></div>
          <p className="lede" data-r>{L("برای کلاس خصوصی، مکالمه یا آمادگی آزمون پیام بدهید.", "Message me for private lessons, conversation practice, or exam prep.")}</p>
          <div className="cta" data-r>
            {h.contacts.map((c) => {
              const href = contactHref(String(c.type), String(c.value))
              const label = T(c, "label") || optLabel(String(c.type), lang)
              return (
                <a key={c.id} className={c.is_primary ? "btn" : "btn ghost"} href={href} target={/^(tel|mailto):/.test(href) ? undefined : "_blank"} rel="noopener noreferrer me">
                  {label}{c.type === "phone" ? ` · ${short(c.value)}` : ""}
                </a>
              )
            })}
            {cvUrl ? <a className="btn ghost" href={cvUrl} download target="_blank" rel="noopener noreferrer">{L("دانلود رزومه", "Download CV")}</a> : null}
          </div>
        </section>
      </main>

      <footer className="ft" data-r>
        <div className="ft-top">
          <div>
            <strong>{h.name}</strong>
            <p>{T(h.id, "headline")}</p>
          </div>
          <div className="ft-links">
            <a href="#top">{L("رزومه", "Resume")}</a>
            {cvUrl ? <a href={cvUrl} download target="_blank" rel="noopener noreferrer">{L("دانلود رزومه", "Download CV")}</a> : null}
            {h.contacts.filter((c) => c.type === "email" || c.type === "phone").map((c) => (
              <a key={c.id} href={contactHref(String(c.type), String(c.value))}>{T(c, "label") || optLabel(String(c.type), lang)}</a>
            ))}
          </div>
        </div>
        <div className="ft-bot">
          <span>© {yearLabel} {h.name}{location ? ` · ${location.split("،")[0] || location.split(",")[0]}` : ""}</span>
          <a href="#top">{L("بازگشت به بالا", "Back to top")} ↑</a>
        </div>
      </footer>
    </div>
  )
}
