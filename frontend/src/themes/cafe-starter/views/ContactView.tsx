"use client"

import Image from "next/image"
import Link from "next/link"
import QRCode from "qrcode"
import { useLocale, useTranslations } from "next-intl"
import {
  AtSign,
  Check,
  Clock,
  Copy,
  Globe,
  Link2,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Navigation,
  Phone,
  QrCode,
  Send,
  Store,
  UtensilsCrossed,
} from "lucide-react"
import { useEffect, useMemo, useState, type ComponentType, type CSSProperties, type FormEvent } from "react"

import { MapPinPicker } from "@/components/MapPinPickerLazy"
import { api, ApiError } from "@/lib/api"

import { digits, localizedField, placeholderFor } from "../lib/helpers"
import { useSkinScheme } from "../lib/useSkinScheme"
import { cafeSkinLayout, resolveCafeSkin } from "../skin"
import type { CafeContactPayload } from "../types"
import "../menu.css"
import "../skins/item-page.css"
import "./contact.css"

const DAY_KEYS = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"] as const
type DayKey = (typeof DAY_KEYS)[number]

function dayKey(raw: string): DayKey | null {
  const short = raw.trim().toLowerCase().slice(0, 3)
  return DAY_KEYS.find((d) => d.startsWith(short)) ?? null
}

/** Local weekday in the cafe's timezone, as one of DAY_KEYS. */
function todayKey(tz?: string): DayKey | null {
  try {
    const name = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: tz || "Asia/Tehran" }).format(new Date())
    return dayKey(name)
  } catch {
    return null
  }
}

function jalali(iso: string, locale: string) {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en-US", { weekday: "long", day: "numeric", month: "long" }).format(d)
}

function asciiDigits(v: string) {
  return v.replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
}

function telHref(phone: string) {
  return `tel:${asciiDigits(phone).replace(/[^\d+]/g, "")}`
}

function handleUrl(raw: string | null | undefined, base: string) {
  if (!raw) return null
  const v = raw.trim()
  if (/^https?:\/\//i.test(v)) return v
  return `${base}${v.replace(/^@/, "")}`
}

function whatsappUrl(raw?: string | null) {
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return raw
  let num = asciiDigits(raw).replace(/\D/g, "")
  if (num.startsWith("0")) num = `98${num.slice(1)}`
  return num ? `https://wa.me/${num}` : null
}

type LinkRow = { key: string; label: string; href: string; icon: ComponentType<{ className?: string }>; display?: string; copy?: string; external?: boolean }

export function ContactView({ data }: { data: CafeContactPayload }) {
  const t = useTranslations("cafe_starter.contact")
  const tc = useTranslations("cafe_starter")
  const locale = useLocale()
  const skin = resolveCafeSkin(data.tenant.active_theme_slug)
  const layout = cafeSkinLayout(skin)
  const scheme = useSkinScheme(skin)
  const [copied, setCopied] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)

  const c = data.contact
  const none = t("none")
  const tagline = localizedField(locale, data.tagline_fa, data.tagline_en)
  const address = localizedField(locale, c.address_fa, c.address_en)
  const logo = scheme === "dark" ? data.tenant.logo_dark_url || data.tenant.logo_url : data.tenant.logo_url
  // A custom accent from the menu settings repaints the page like the catalogue does; the default keeps the skin palette.
  const accent = data.accent_color && data.accent_color.toLowerCase() !== "#c46b3a" ? data.accent_color : null
  const style = accent ? ({ ["--cafe-accent" as string]: accent } as CSSProperties) : undefined

  useEffect(() => {
    let alive = true
    QRCode.toString(`${window.location.origin}/contact`, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
      .then((svg) => alive && setQr(svg))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      window.setTimeout(() => setCopied((k) => (k === key ? null : k)), 1800)
    } catch {
      /* clipboard blocked: the link itself still works */
    }
  }

  const links = useMemo(() => {
    const rows: LinkRow[] = []
    if (c.phone) rows.push({ key: "phone", label: t("call"), href: telHref(c.phone), icon: Phone, display: digits(c.phone, locale), copy: asciiDigits(c.phone) })
    const wa = whatsappUrl(c.whatsapp)
    if (wa) rows.push({ key: "whatsapp", label: t("whatsapp"), href: wa, icon: MessageCircle, external: true })
    const tg = handleUrl(c.telegram, "https://t.me/")
    if (tg) rows.push({ key: "telegram", label: t("telegram"), href: tg, icon: Send, external: true })
    const bale = handleUrl(c.bale, "https://ble.ir/")
    if (bale) rows.push({ key: "bale", label: t("bale"), href: bale, icon: MessageSquare, external: true })
    const ig = handleUrl(c.instagram, "https://instagram.com/")
    if (ig) rows.push({ key: "instagram", label: t("instagram"), href: ig, icon: AtSign, display: c.instagram?.startsWith("http") ? undefined : c.instagram ?? undefined, external: true })
    if (c.email) rows.push({ key: "email", label: t("email"), href: `mailto:${c.email}`, icon: Mail, display: c.email, copy: c.email })
    if (c.website) rows.push({ key: "website", label: t("website"), href: /^https?:/i.test(c.website) ? c.website : `https://${c.website}`, icon: Globe, external: true })
    data.socials.forEach((s, i) => rows.push({ key: `social-${i}`, label: s.label || s.url, href: s.url, icon: Link2, external: true }))
    data.links.forEach((l) => rows.push({ key: `link-${l.id}`, label: l.label || l.url, href: l.url, icon: Link2, external: /^https?:/i.test(l.url) }))
    return rows
  }, [c, data.links, data.socials, locale, t])

  const days = useMemo(() => {
    const byKey = new Map<DayKey, CafeContactPayload["hours"]["days"][number]>()
    for (const d of data.hours.days) {
      const k = dayKey(d.day)
      if (k && !byKey.has(k)) byKey.set(k, d)
    }
    return DAY_KEYS.map((k) => ({ key: k, row: byKey.get(k) ?? null }))
  }, [data.hours.days])
  const today = todayKey(data.hours.timezone)
  const hasHours = data.hours.days.length > 0

  const loc = data.location
  const mapLinks = loc
    ? [
        { key: "neshan", label: t("open_neshan"), href: `https://neshan.org/maps/@${loc.lat},${loc.lng},17z` },
        { key: "balad", label: t("open_balad"), href: `https://balad.ir/location?latitude=${loc.lat}&longitude=${loc.lng}&zoom=17` },
        { key: "google", label: t("open_google"), href: `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}` },
      ]
    : c.map_url
      ? [{ key: "map", label: t("open_map"), href: c.map_url }]
      : []

  const openState = data.hours.is_open === true ? "open" : data.hours.is_open === false ? "closed" : "unknown"

  return (
    <div className="cafe-shell cafe-contact" data-skin={skin} data-layout={layout} data-scheme={scheme} style={style}>
      <section className="cc-hero" aria-labelledby="cc-title">
        <div className="cc-hero-glow" aria-hidden="true" />
        <div className="cc-hero-inner">
          <div className="cc-logo" style={logo ? undefined : { background: placeholderFor(data.tenant.name) }}>
            {logo ? <Image src={logo} alt="" width={96} height={96} unoptimized /> : <Store className="size-9" aria-hidden="true" />}
          </div>
          <h1 id="cc-title">{data.tenant.name}</h1>
          <p className="cc-tagline">{tagline ?? t("hero_fallback")}</p>
          <div className="cc-hero-meta">
            <span className="cc-badge" data-state={openState} role="status">
              <span className="cc-dot" aria-hidden="true" />
              {openState === "open" ? t("open_now") : openState === "closed" ? (data.hours.reason === "holiday" ? t("closed_holiday") : t("closed_now")) : t("hours_unknown")}
            </span>
            <Link href="/catalogue" className="cc-chip">
              <UtensilsCrossed className="size-4" aria-hidden="true" />
              {tc("back_to_menu")}
            </Link>
          </div>
        </div>
      </section>

      <div className="cc-body">
        <section className="cc-card cc-links" aria-labelledby="cc-links-h">
          <h2 id="cc-links-h">{t("links_heading")}</h2>
          {links.length ? (
            <ul>
              {links.map((row, i) => {
                const Icon = row.icon
                return (
                  <li key={row.key} style={{ ["--i" as string]: i } as CSSProperties}>
                    <a className="cc-link" href={row.href} {...(row.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                      <span className="cc-link-icon" aria-hidden="true">
                        <Icon className="size-5" />
                      </span>
                      <span className="cc-link-copy">
                        <strong>{row.label}</strong>
                        {row.display ? <small dir="ltr">{row.display}</small> : null}
                      </span>
                    </a>
                    {row.copy ? (
                      <button
                        type="button"
                        className="cc-copy"
                        onClick={() => void copy(row.key, row.copy!)}
                        aria-label={t("copy_label", { what: row.label })}
                        data-done={copied === row.key ? "true" : "false"}
                      >
                        {copied === row.key ? <Check className="size-4" /> : <Copy className="size-4" />}
                      </button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="cc-empty">{none}</p>
          )}
          <p className="cc-sr" aria-live="polite">
            {copied ? t("copied") : ""}
          </p>
        </section>

        <section className="cc-card cc-hours" aria-labelledby="cc-hours-h">
          <h2 id="cc-hours-h">
            <Clock className="size-5" aria-hidden="true" />
            {t("hours_heading")}
          </h2>
          {hasHours ? (
            <ul>
              {days.map(({ key, row }) => (
                <li key={key} data-today={today === key ? "true" : "false"}>
                  <span>
                    {tc(`days.${key}`)}
                    {today === key ? <em>{t("today")}</em> : null}
                  </span>
                  <span data-closed={!row || row.closed ? "true" : "false"}>
                    {!row ? none : row.closed ? tc("closed") : row.open && row.close ? tc("hours_range", { open: digits(row.open, locale), close: digits(row.close, locale) }) : none}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cc-empty">{none}</p>
          )}
          {data.hours.closed_dates.length ? (
            <div className="cc-holidays">
              <h3>{t("holidays_heading")}</h3>
              <ul>
                {data.hours.closed_dates.slice(0, 6).map((d) => (
                  <li key={d}>{jalali(d, locale)}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="cc-card cc-where" aria-labelledby="cc-where-h">
          <h2 id="cc-where-h">
            <MapPin className="size-5" aria-hidden="true" />
            {t("address_heading")}
          </h2>
          <div className="cc-address">
            <p>{address ?? none}</p>
            {address ? (
              <button type="button" className="cc-copy" onClick={() => void copy("address", address)} aria-label={t("copy_label", { what: t("address_heading") })} data-done={copied === "address" ? "true" : "false"}>
                {copied === "address" ? <Check className="size-4" /> : <Copy className="size-4" />}
              </button>
            ) : null}
          </div>
          {loc ? (
            <div className="cc-map" role="region" aria-label={t("map_label")}>
              <MapPinPicker value={loc} center={loc} readOnly height={280} />
            </div>
          ) : null}
          {mapLinks.length ? (
            <div className="cc-map-links">
              {mapLinks.map((m) => (
                <a key={m.key} href={m.href} target="_blank" rel="noopener noreferrer" className="cc-chip">
                  <Navigation className="size-4" aria-hidden="true" />
                  {m.label}
                </a>
              ))}
            </div>
          ) : null}
        </section>

        {data.branches.length > 1 ? (
          <section className="cc-card cc-branches" aria-labelledby="cc-branches-h">
            <h2 id="cc-branches-h">{t("branches_heading")}</h2>
            <ul>
              {data.branches.map((b) => (
                <li key={b.id}>
                  <strong>{localizedField(locale, b.name_fa, b.name_en) ?? none}</strong>
                  <span>{localizedField(locale, b.address_fa, b.address_en) ?? none}</span>
                  {b.phone ? (
                    <a href={telHref(b.phone)} dir="ltr">
                      {digits(b.phone, locale)}
                    </a>
                  ) : (
                    <span>{none}</span>
                  )}
                  <Link className="cc-chip" href={`/catalogue?branch=${encodeURIComponent(b.slug)}`}>
                    {t("branch_menu")}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {data.form ? <ContactForm form={data.form} /> : null}

        <section className="cc-card cc-qr" aria-labelledby="cc-qr-h">
          <h2 id="cc-qr-h">
            <QrCode className="size-5" aria-hidden="true" />
            {t("qr_heading")}
          </h2>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`} alt={t("qr_alt", { name: data.tenant.name })} width={168} height={168} />
          ) : (
            <div className="cc-qr-skeleton" aria-hidden="true" />
          )}
          <p>{t("qr_hint")}</p>
        </section>
      </div>
    </div>
  )
}

function ContactForm({ form }: { form: NonNullable<CafeContactPayload["form"]> }) {
  const t = useTranslations("cafe_starter.contact")
  const [values, setValues] = useState<Record<string, string>>({})
  const [trap, setTrap] = useState("")
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [message, setMessage] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (trap) return // bots fill the hidden field
    setState("sending")
    setMessage(null)
    try {
      const fields = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, asciiDigits(v).trim()]))
      await api(`/api/v1/public/link-hub/forms/${form.id}/submit`, { method: "POST", json: { fields } })
      setState("sent")
      setValues({})
    } catch (err) {
      setState("error")
      setMessage(err instanceof ApiError && err.message ? err.message : t("form_error"))
    }
  }

  return (
    <section className="cc-card cc-form" aria-labelledby="cc-form-h">
      <h2 id="cc-form-h">{form.title || t("form_heading")}</h2>
      {state === "sent" ? (
        <p className="cc-ok" role="status">
          {t("form_sent")}
        </p>
      ) : (
        <form onSubmit={submit} noValidate={false}>
          {form.fields.map((f) => {
            const id = `cc-f-${f.name}`
            const common = {
              id,
              name: f.name,
              required: Boolean(f.required),
              value: values[f.name] ?? "",
              maxLength: 2000,
              onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [f.name]: e.target.value })),
            }
            return (
              <label key={f.name} htmlFor={id} className="cc-field">
                <span>
                  {f.label || f.name}
                  {f.required ? <em aria-hidden="true"> *</em> : null}
                </span>
                {f.type === "textarea" ? (
                  <textarea {...common} rows={4} />
                ) : (
                  <input {...common} type={f.type === "tel" ? "tel" : f.type === "email" ? "email" : "text"} inputMode={f.type === "tel" ? "tel" : undefined} dir={f.type === "tel" || f.type === "email" ? "ltr" : undefined} />
                )}
              </label>
            )
          })}
          <input className="cc-trap" tabIndex={-1} autoComplete="off" aria-hidden="true" value={trap} onChange={(e) => setTrap(e.target.value)} name="website_confirm" />
          {message ? (
            <p className="cc-error" role="alert">
              {message}
            </p>
          ) : null}
          <button type="submit" className="cafe-primary-btn" disabled={state === "sending"}>
            {state === "sending" ? t("form_sending") : form.submit_label || t("form_submit")}
          </button>
        </form>
      )}
    </section>
  )
}
