"use client"

import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react"
import { ArrowUpLeft, ArrowUpRight, Check, Copy, Globe, Languages, Mail, MessageCircle, Phone, Sparkles, UserPlus } from "lucide-react"

import "../site/link-hub-spotlight.css"
import { BlockView, type Handlers, type PublicBlock, type PublicPage } from "./LinkHubView"
import { LH_UI, defaultLocale, downloadVCard, localizePage, pageLocales, type LhLocale } from "./i18n"
import { faDigits, normalizeTheme } from "./view-utils"

/* Brand glyphs (simple-icons paths) for networks without a bundled asset. */
const GLYPHS: Record<string, string> = {
  github:
    "M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.6.2 2.9.1 3.2.8.8 1.3 1.9 1.3 3.1 0 4.7-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3",
  linkedin:
    "M20.4 20.5h-3.6v-5.6c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9v5.7H9.3V9h3.4v1.6h.1c.5-.9 1.6-1.8 3.4-1.8 3.6 0 4.3 2.4 4.3 5.5v6.2zM5.3 7.4a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2zM7.1 20.5H3.6V9h3.5v11.5zM22.2 0H1.8C.8 0 0 .8 0 1.7v20.6c0 .9.8 1.7 1.8 1.7h20.4c1 0 1.8-.8 1.8-1.7V1.7C24 .8 23.2 0 22.2 0z",
  whatsapp:
    "M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5.3-.5c.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3M12 21.8a9.9 9.9 0 0 1-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.9 9.9 0 1 1 12 21.8M20.5 3.5A11.8 11.8 0 0 0 1.7 17.6L0 24l6.5-1.7a11.8 11.8 0 0 0 17.3-10.4c0-3.2-1.2-6.1-3.4-8.4",
  telegram:
    "M11.9 0a12 12 0 1 0 .1 24 12 12 0 0 0-.1-24zm5.6 8.2-1.9 8.9c-.1.6-.5.8-1 .5l-2.9-2.1-1.4 1.3c-.2.2-.3.3-.6.3l.2-2.9 5.4-4.9c.2-.2 0-.3-.4-.1l-6.6 4.2-2.9-.9c-.6-.2-.6-.6.1-.9l11.3-4.4c.5-.2 1 .1.7 1z",
  instagram:
    "M12 2.2c3.2 0 3.6 0 4.8.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8C2.4 3.9 3.9 2.4 7.2 2.3 8.4 2.2 8.8 2.2 12 2.2zM12 0C8.7 0 8.3 0 7.1.1 2.7.3.3 2.7.1 7.1 0 8.3 0 8.7 0 12s0 3.7.1 4.9c.2 4.4 2.6 6.8 7 7 1.2.1 1.6.1 4.9.1s3.7 0 4.9-.1c4.4-.2 6.8-2.6 7-7 .1-1.2.1-1.6.1-4.9s0-3.7-.1-4.9c-.2-4.4-2.6-6.8-7-7C15.7 0 15.3 0 12 0zm0 5.8a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-11.8a1.4 1.4 0 1 0 0 2.9 1.4 1.4 0 0 0 0-2.9z",
}

export function networkOf(url: string, hint = ""): string {
  const hay = `${hint} ${url}`.toLowerCase()
  if (hay.includes("github")) return "github"
  if (hay.includes("linkedin")) return "linkedin"
  if (hay.includes("wa.me") || hay.includes("whatsapp")) return "whatsapp"
  if (hay.includes("t.me") || hay.includes("telegram")) return "telegram"
  if (hay.includes("instagram")) return "instagram"
  if (url.startsWith("tel:")) return "phone"
  if (url.startsWith("mailto:")) return "mail"
  if (url === "#vcard") return "vcard"
  return "web"
}

export function Glyph({ kind, size = 22 }: { kind: string; size?: number }) {
  if (GLYPHS[kind]) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
        <path d={GLYPHS[kind]} />
      </svg>
    )
  }
  const props = { size, strokeWidth: 1.9, "aria-hidden": true } as const
  if (kind === "phone") return <Phone {...props} />
  if (kind === "mail") return <Mail {...props} />
  if (kind === "vcard") return <UserPlus {...props} />
  if (kind === "message") return <MessageCircle {...props} />
  return <Globe {...props} />
}

export function host(url: string) {
  return url.replace(/^(https?:\/\/)?(www\.)?/i, "").replace(/^mailto:|^tel:/, "").replace(/\/$/, "")
}

function spot(e: PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`)
}

function CopyChip({ value, ui }: { value: string; ui: Record<string, string> }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className={`sp-copy${done ? " is-done" : ""}`}
      aria-label={`${ui.copy} ${value}`}
      onClick={async (e) => {
        e.preventDefault()
        try {
          await navigator.clipboard.writeText(value)
          setDone(true)
          window.setTimeout(() => setDone(false), 1500)
        } catch {
          /* blocked */
        }
      }}
    >
      {done ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
      <span>{done ? ui.copied : ui.copy}</span>
    </button>
  )
}

type Tile = { key: string; label: string; sub: string; href: string; kind: string; copy?: string; blockId: number }

export function tilesFrom(blocks: PublicBlock[], locale: LhLocale): Tile[] {
  const out: Tile[] = []
  for (const b of blocks) {
    const p = b.payload
    if (b.type === "link") {
      const url = String(p.url || "#")
      out.push({ key: `l${b.id}`, label: String(p.label || host(url)), sub: String(p.sublabel || host(url)), href: url, kind: networkOf(url, String(p.icon || "")), blockId: b.id, copy: url })
    }
    if (b.type === "contact") {
      if (p.phone) {
        const v = String(p.phone)
        out.push({ key: `p${b.id}`, label: locale === "fa" ? "تلفن" : "Phone", sub: locale === "fa" ? faDigits(v) : v, href: `tel:${v.replace(/[^\d+]/g, "")}`, kind: "phone", copy: v, blockId: b.id })
      }
      for (const [i, ph] of ((Array.isArray(p.phones) ? p.phones : []) as Array<Record<string, unknown>>).entries()) {
        const v = String(ph.value || "")
        if (!v) continue
        const d = v.replace(/[^\d+]/g, "")
        out.push({
          key: `ph${b.id}-${i}`,
          label: String(ph.label || (locale === "fa" ? "تلفن" : "Phone")),
          sub: locale === "fa" ? faDigits(v) : v,
          href: ph.whatsapp ? `https://wa.me/${d.replace(/^\+/, "").replace(/^0/, "98")}` : `tel:${d}`,
          kind: ph.whatsapp ? "whatsapp" : "phone",
          copy: v,
          blockId: b.id,
        })
      }
      if (p.email) {
        const v = String(p.email)
        out.push({ key: `e${b.id}`, label: locale === "fa" ? "ایمیل" : "Email", sub: v, href: `mailto:${v}`, kind: "mail", copy: v, blockId: b.id })
      }
      for (const [i, s] of ((Array.isArray(p.socials) ? p.socials : []) as Array<Record<string, unknown>>).entries()) {
        const url = String(s.url || "")
        if (!url) continue
        out.push({ key: `s${b.id}-${i}`, label: String(s.label || host(url)), sub: String(s.value || host(url)), href: url, kind: networkOf(url, String(s.network || "")), copy: String(s.value || host(url)), blockId: b.id })
      }
    }
  }
  return out
}

export function LinkHubSpotlight({ page: rawPage, handlers = {}, footer }: { page: PublicPage; handlers?: Handlers; footer?: ReactNode }) {
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

  const ctas = page.blocks.filter((b) => b.type === "cta" && b.payload.variant !== "chip")
  const chips = page.blocks.filter((b) => b.type === "cta" && b.payload.variant === "chip")
  const tiles = tilesFrom(page.blocks, locale)
  const linkTiles = tiles.filter((x) => !["phone", "mail", "whatsapp"].includes(x.kind))
  const directTiles = tiles.filter((x) => ["phone", "mail", "whatsapp"].includes(x.kind))
  const sections = page.blocks.filter((b) => b.type === "section")
  const rest = page.blocks.filter((b) => !["cta", "link", "contact", "section"].includes(b.type))
  const highlights = (Array.isArray(t.highlights) ? t.highlights : []) as Array<Record<string, string>>
  const tags = (!fa && Array.isArray(t.tags_en) && t.tags_en.length ? t.tags_en : Array.isArray(t.tags) ? t.tags : []) as string[]
  const title = page.profile.title || ""
  const headline = theme.headline || title
  const accentWord = theme.headline_accent
  const sectionTitle = (i: number, fallback: string) => (sections[i] ? String(sections[i].payload.title) : fallback)

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

  const style = { ["--sp-accent" as string]: theme.accent, ["--sp-bg" as string]: theme.background } as CSSProperties

  const renderHeadline = () => {
    if (!accentWord || !headline.includes(accentWord)) return headline
    const i = headline.lastIndexOf(accentWord)
    return (
      <>
        {headline.slice(0, i)}
        <em>{accentWord}</em>
        {headline.slice(i + accentWord.length)}
      </>
    )
  }

  return (
    <div className="sp-root" style={style} dir={fa ? "rtl" : "ltr"} lang={locale} data-mode={theme.mode} key={locale}>
      <div className="sp-bg" aria-hidden>
        <span className="sp-orb sp-orb-a" />
        <span className="sp-orb sp-orb-b" />
        <span className="sp-orb sp-orb-c" />
        <span className="sp-grid" />
        <span className="sp-grain" />
      </div>

      <header className="sp-top">
        <span className="sp-brand">
          <span className="sp-brand-dot" />
          {title}
        </span>
        {locales.length > 1 ? (
          <div className="sp-lang" role="group" aria-label="Language">
            <Languages size={15} aria-hidden />
            {locales.map((l) => (
              <button key={l} type="button" className={l === locale ? "is-on" : ""} aria-pressed={l === locale} onClick={() => switchTo(l)}>
                {l === "fa" ? "فا" : "EN"}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <div className="sp-shell">
        <section className="sp-hero">
          <div className="sp-portrait">
            <span className="sp-ring" aria-hidden />
            <span className="sp-halo" aria-hidden />
            {page.profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={page.profile.avatar_url} alt={title} width={360} height={360} fetchPriority="high" />
            ) : (
              <span className="sp-portrait-fallback">{title.slice(0, 1)}</span>
            )}
            {theme.kicker ? (
              <span className="sp-badge">
                <Sparkles size={14} aria-hidden />
                {theme.kicker}
              </span>
            ) : null}
          </div>

          <div className="sp-intro">
            {theme.headline && title !== headline ? <p className="sp-name">{title}</p> : null}
            <h1 className="sp-title">{renderHeadline()}</h1>
            {page.profile.bio ? <p className="sp-bio">{num(page.profile.bio)}</p> : null}

            {highlights.length ? (
              <dl className="sp-stats">
                {highlights.map((h, i) => (
                  <div key={i} className="sp-stat" style={{ ["--i" as string]: i } as CSSProperties}>
                    <dt>{fa ? h.value : h.value_en || h.value}</dt>
                    <dd>{fa ? h.label : h.label_en || h.label}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>

          {ctas.length ? (
            <nav className="sp-dock" aria-label={ui.quick}>
              {ctas.map((b, i) => {
                const url = String(b.payload.url)
                const kind = b.payload.action === "vcard" ? "vcard" : networkOf(url, String(b.payload.icon || ""))
                const ext = /^https?:/.test(url)
                return (
                  <a
                    key={b.id}
                    className={`sp-act is-${kind}${i === 0 ? " is-lead" : ""}`}
                    href={handlers.preview || kind === "vcard" ? undefined : url}
                    target={ext ? "_blank" : undefined}
                    rel={ext ? "noreferrer noopener" : undefined}
                    role={kind === "vcard" ? "button" : undefined}
                    tabIndex={0}
                    onPointerMove={spot}
                    onClick={() => {
                      handlers.onClickTrack?.(b.id, url)
                      if (kind === "vcard" && !handlers.preview) downloadVCard(rawPage, { title: String(theme.headline || "") })
                    }}
                  >
                    <span className="sp-act-ico">
                      <Glyph kind={kind} size={22} />
                    </span>
                    <span className="sp-act-txt">
                      <strong>{String(b.payload.label)}</strong>
                      {b.payload.sublabel ? <small dir="auto">{num(String(b.payload.sublabel))}</small> : null}
                    </span>
                  </a>
                )
              })}
            </nav>
          ) : null}
          {chips.length ? (
            <div className="sp-chips">
              {chips.map((b) => (
                <a key={b.id} href={handlers.preview ? undefined : String(b.payload.url)} className="sp-chip" target="_blank" rel="noreferrer noopener">
                  {String(b.payload.label)}
                </a>
              ))}
            </div>
          ) : null}
        </section>

        <main className="sp-main">
          {linkTiles.length ? (
            <section className="sp-block">
              <h2 className="sp-h2">
                <span>01</span>
                {sectionTitle(0, ui.links)}
              </h2>
              <div className="sp-bento">
                {linkTiles.map((x, i) => (
                  <a
                    key={x.key}
                    className={`sp-tile is-${x.kind}`}
                    href={handlers.preview ? undefined : x.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    onPointerMove={spot}
                    onClick={() => handlers.onClickTrack?.(x.blockId, x.href)}
                    style={{ ["--i" as string]: i } as CSSProperties}
                  >
                    <span className="sp-tile-ico">
                      <Glyph kind={x.kind} size={26} />
                    </span>
                    <span className="sp-tile-txt">
                      <strong>{x.label}</strong>
                      <small dir="ltr">{x.sub}</small>
                    </span>
                    <span className="sp-tile-go" aria-hidden>
                      {fa ? <ArrowUpLeft size={18} /> : <ArrowUpRight size={18} />}
                    </span>
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          {directTiles.length ? (
            <section className="sp-block">
              <h2 className="sp-h2">
                <span>02</span>
                {sectionTitle(1, ui.contact)}
              </h2>
              <div className="sp-rows">
                {directTiles.map((x) => (
                  <div key={x.key} className={`sp-row is-${x.kind}`}>
                    <a href={handlers.preview ? undefined : x.href} onClick={() => handlers.onClickTrack?.(x.blockId, x.href)}>
                      <span className="sp-row-ico">
                        <Glyph kind={x.kind} size={20} />
                      </span>
                      <span className="sp-row-txt">
                        <small>{x.label}</small>
                        <strong dir="ltr">{x.sub}</strong>
                      </span>
                    </a>
                    {x.copy ? <CopyChip value={x.copy} ui={ui} /> : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {tags.length ? (
            <section className="sp-block sp-tags-wrap" aria-label={ui.skills}>
              <h2 className="sp-h2">
                <span>03</span>
                {sectionTitle(2, ui.skills)}
              </h2>
              <div className="sp-marquee">
                <div className="sp-marquee-track">
                  {[...tags, ...tags].map((tag, i) => (
                    <span key={i} className="sp-tag" aria-hidden={i >= tags.length}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {rest.length ? (
            <section className="sp-block sp-legacy">
              {rest.map((b) => (
                <BlockView key={b.id} block={b} h={handlers} />
              ))}
            </section>
          ) : null}

          {theme.footer_note ? <p className="sp-foot">{num(theme.footer_note)}</p> : null}
          {footer}
        </main>
      </div>
    </div>
  )
}
