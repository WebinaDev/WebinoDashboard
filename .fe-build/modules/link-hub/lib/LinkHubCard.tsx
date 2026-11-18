"use client"

/* «card» layout: a centered frosted card with an arch portrait (pulse dot), headline, optional pulse line, tags and a
 * link list. Primary CTAs render as highlighted rows, the vCard CTA as a text action. Accent and background come from
 * the theme; works for any site (layout: "card"). */

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react"

import "@/builder/render/resume-fonts.css"
import "../site/link-hub-card.css"
import type { Handlers, PublicPage } from "./LinkHubView"
import { Glyph, host, networkOf, tilesFrom } from "./LinkHubSpotlight"
import { LH_UI, defaultLocale, downloadVCard, localizePage, pageLocales, type LhLocale } from "./i18n"
import { faDigits, normalizeTheme } from "./view-utils"

export function LinkHubCard({ page: rawPage, handlers = {}, footer }: { page: PublicPage; handlers?: Handlers; footer?: ReactNode }) {
  const locales = pageLocales(rawPage.profile.theme_json)
  const [locale, setLocale] = useState<LhLocale>(() => defaultLocale(rawPage.profile.theme_json))
  useEffect(() => {
    if (locales.length < 2) return
    const q = new URLSearchParams(window.location.search).get("lang")
    const saved = q || window.localStorage.getItem("lh-locale")
    if (saved === "fa" || saved === "en") setLocale(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const page = useMemo(() => localizePage(rawPage, locale), [rawPage, locale])
  const theme = useMemo(() => normalizeTheme(page.profile.theme_json), [page.profile.theme_json])
  const t = page.profile.theme_json as Record<string, unknown>
  const ui = LH_UI[locale]
  const fa = locale === "fa"
  const num = (v: string) => (fa ? faDigits(v) : v)
  const title = page.profile.title || ""
  const tags = (!fa && Array.isArray(t.tags_en) && t.tags_en.length ? t.tags_en : Array.isArray(t.tags) ? t.tags : []) as string[]
  const ctas = page.blocks.filter((b) => b.type === "cta")
  const lead = ctas.filter((b) => b.payload.action !== "vcard")
  const vcard = ctas.find((b) => b.payload.action === "vcard")
  const tiles = tilesFrom(page.blocks, locale)
  const switchTo = (next: LhLocale) => {
    setLocale(next)
    try {
      window.localStorage.setItem("lh-locale", next)
      const url = new URL(window.location.href)
      url.searchParams.set("lang", next)
      window.history.replaceState(null, "", url)
    } catch {
      /* ignore */
    }
  }
  const style = { ["--lc-accent" as string]: theme.accent, ["--lc-bg" as string]: theme.background } as CSSProperties
  let i = 0
  const row = (key: string | number, href: string, kind: string, label: string, sub: string, blockId: number, hero = false) => {
    const ext = /^https?:/.test(href)
    return (
      <a key={key} className={`lc-l${hero ? " is-hero" : ""}`} style={{ animationDelay: `${(i++) * 0.08}s` }} href={handlers.preview ? undefined : href}
        target={ext ? "_blank" : undefined} rel={ext ? "noreferrer noopener me" : undefined} onClick={() => handlers.onClickTrack?.(blockId, href)}>
        <i><Glyph kind={kind} size={20} /></i>
        <span><b>{label}</b>{sub ? <small dir="ltr">{sub}</small> : null}</span>
      </a>
    )
  }
  return (
    <div className="lc-root" style={style} dir={fa ? "rtl" : "ltr"} lang={locale} key={locale}>
      <span className="lc-cell lc-cell-a" aria-hidden /><span className="lc-cell lc-cell-b" aria-hidden />
      <main className="lc-card">
        {locales.length > 1 ? (
          <div className="lc-lang" role="group" aria-label="Language">
            {locales.filter((l) => l !== locale).map((l) => <button key={l} type="button" onClick={() => switchTo(l)}>{l === "fa" ? "فا" : "EN"}</button>)}
          </div>
        ) : null}
        <div className="lc-av">
          <div className="lc-av-bg" />
          {page.profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={page.profile.avatar_url} alt={title} fetchPriority="high" />
          ) : <span className="lc-av-fb">{title.slice(0, 1)}</span>}
          <span className="lc-pulse" aria-hidden />
        </div>
        <h1>{title}</h1>
        {theme.headline ? <p className="lc-sub">{num(theme.headline)}</p> : null}
        <svg className="lc-ecg" viewBox="0 0 160 24" aria-hidden><path fill="none" stroke="currentColor" strokeWidth="1.6" d="M0 14H50l6-10 8 18 6-12 4 4H160" /></svg>
        {page.profile.bio ? <p className="lc-bio">{num(page.profile.bio)}</p> : null}
        {tags.length ? <div className="lc-tags">{tags.map((x) => <span key={x}>{x}</span>)}</div> : null}
        <div className="lc-list">
          {lead.map((b) => { const url = String(b.payload.url || "#"); return row(`c${b.id}`, url, networkOf(url, String(b.payload.icon || "")), String(b.payload.label), String(b.payload.sublabel || host(url)), b.id, true) })}
          {tiles.map((x) => row(x.key, x.href, x.kind, x.label, x.sub, x.blockId))}
        </div>
        {vcard ? (
          <button type="button" className="lc-vc" onClick={() => { handlers.onClickTrack?.(vcard.id, "#vcard"); if (!handlers.preview) downloadVCard(rawPage, { title: String(theme.headline || "") }) }}>
            {String(vcard.payload.label || ui.copy)}{vcard.payload.sublabel ? ` (${String(vcard.payload.sublabel)})` : ""}
          </button>
        ) : null}
        {theme.footer_note ? <footer>{num(theme.footer_note)}</footer> : null}
        {footer}
      </main>
    </div>
  )
}
