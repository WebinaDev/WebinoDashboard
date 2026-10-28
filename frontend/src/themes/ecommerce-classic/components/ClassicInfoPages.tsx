"use client"
import Link from "next/link"
import { useMemo, useRef, useState } from "react"

import { useClassicThemeSettings } from "@/themes/shared/site-branding-context"
import { quietApi } from "@/builder/storefront/session"
import type { ContactFallback, FaqItem } from "../lib/faq-extract"
import { ClassicPageShell } from "./ClassicPages"
import { IconChevronDown, IconClock, IconMail, IconPhone, IconPin, IconSearch } from "./icons"
import { useLocale } from "next-intl"

function useTextDigits() {
  const fa = useLocale().startsWith("fa")
  return (v: string | number) => (fa ? String(v).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]) : String(v))
}

const HOME = { label: "خانه", href: "/" }

/* ------------------------------------------------------------------ FAQ */

export function ClassicFaqPage({ title, items }: { title: string; items: FaqItem[] }) {
  const digits = useTextDigits()
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(0)
  const list = useMemo(() => {
    const q = query.trim()
    return q ? items.filter((x) => x.q.includes(q) || x.a.includes(q)) : items
  }, [items, query])
  return (
    <ClassicPageShell title={title} trail={[HOME, { label: title }]}>
      <div className="sfc-faqpage">
        <div className="sfc-faqpage__bar">
          <label className="sfc-faqpage__search">
            <IconSearch size={16} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="جستجو در پرسش‌ها…"
              aria-label="جستجو در پرسش‌ها"
            />
          </label>
          <span className="sfc-faqpage__count">{digits(list.length)} پرسش</span>
        </div>
        {list.length ? (
          <ul className="sfc-faqpage__list">
            {list.map((x, i) => {
              const isOpen = open === i
              return (
                <li key={x.q} className={isOpen ? "is-open" : undefined}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`faq-a-${i}`}
                    id={`faq-q-${i}`}
                    onClick={() => setOpen(isOpen ? -1 : i)}
                  >
                    <span>{x.q}</span>
                    <IconChevronDown size={18} />
                  </button>
                  <div id={`faq-a-${i}`} role="region" aria-labelledby={`faq-q-${i}`} hidden={!isOpen}>
                    {x.a.split("\n").map((p, j) => (
                      <p key={j}>{p}</p>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="sfc-box sfc-faqpage__empty">
            <p>{items.length ? "پرسشی با این عبارت پیدا نشد." : "هنوز پرسشی ثبت نشده است."}</p>
            <Link href="/contact" className="sfc-btn">
              پرسش خود را بپرسید
            </Link>
          </div>
        )}
        <div className="sfc-faqpage__cta">
          <strong>پاسخ پرسش خود را پیدا نکردید؟</strong>
          <Link href="/contact" className="sfc-btn">
            تماس با ما
          </Link>
        </div>
      </div>
    </ClassicPageShell>
  )
}

/* -------------------------------------------------------------- contact */

export function ClassicContactPage({
  title,
  intro,
  fallback,
  subject,
}: {
  title: string
  intro?: string
  fallback: ContactFallback
  subject?: string
}) {
  const theme = useClassicThemeSettings()
  const cfg = theme.footer ?? {}
  const digits = useTextDigits()
  const phones = cfg.support_phone ? [String(cfg.support_phone)] : fallback.phones
  const emails = cfg.support_email ? [String(cfg.support_email)] : fallback.emails
  const address = String(cfg.address || fallback.address || "")
  const hours = String(cfg.support_hours || fallback.hours || "")
  const mapSrc = String(cfg.map_embed || "").trim()
  const safeMap = /^https:\/\//i.test(mapSrc) ? mapSrc : ""

  const started = useRef(Date.now())
  const [form, setForm] = useState({ name: "", contact: "", subject: subject ?? "", message: "" })
  const [hp, setHp] = useState("")
  const [state, setState] = useState<"idle" | "busy" | "ok" | "err">("idle")
  const [error, setError] = useState("")

  async function submit() {
    setState("busy")
    setError("")
    const res = await quietApi("/api/v1/public/builder/forms/contact", {
      method: "POST",
      json: {
        form_key: "contact",
        page_uri: typeof window !== "undefined" ? window.location.pathname : "/contact",
        fields: form,
        _hp: hp,
        _t: Date.now() - started.current,
      },
    })
    if (res.ok) {
      setState("ok")
      setForm({ name: "", contact: "", subject: "", message: "" })
    } else {
      setState("err")
      setError(res.status === 429 ? "تعداد پیام‌ها زیاد است؛ کمی بعد دوباره تلاش کنید." : "ارسال پیام انجام نشد. دوباره تلاش کنید.")
    }
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <ClassicPageShell title={title} description={intro} trail={[HOME, { label: title }]}>
      <div className="sfc-contact">
        <aside className="sfc-contact__info">
          {phones.length ? (
            <div className="sfc-contact__row">
              <span className="sfc-contact__icon"><IconPhone size={18} /></span>
              <div>
                <strong>تلفن پشتیبانی</strong>
                {phones.map((p) => (
                  <a key={p} href={`tel:${p}`} dir="ltr">{digits(p)}</a>
                ))}
              </div>
            </div>
          ) : null}
          {emails.length ? (
            <div className="sfc-contact__row">
              <span className="sfc-contact__icon"><IconMail size={18} /></span>
              <div>
                <strong>{String(cfg.support_email_title || "ایمیل")}</strong>
                {emails.map((m) => (
                  <a key={m} href={`mailto:${m}`} dir="ltr">{m}</a>
                ))}
              </div>
            </div>
          ) : null}
          {hours ? (
            <div className="sfc-contact__row">
              <span className="sfc-contact__icon"><IconClock size={18} /></span>
              <div>
                <strong>ساعات پاسخگویی</strong>
                <span>{digits(hours)}</span>
              </div>
            </div>
          ) : null}
          {address ? (
            <div className="sfc-contact__row">
              <span className="sfc-contact__icon"><IconPin size={18} /></span>
              <div>
                <strong>{String(cfg.address_title || "آدرس")}</strong>
                <span>{digits(address)}</span>
              </div>
            </div>
          ) : null}
          {safeMap ? (
            <div className="sfc-contact__map">
              <iframe src={safeMap} title="نقشه" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
            </div>
          ) : address ? (
            <a
              className="sfc-contact__maplink"
              href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconPin size={16} /> مشاهده روی نقشه
            </a>
          ) : null}
        </aside>
        <form
          className="sfc-box sfc-contact__form"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <h2>ارسال پیام</h2>
          <div className="sfc-contact__grid">
            <label className="sfc-field">
              <span>نام و نام خانوادگی</span>
              <input required maxLength={120} value={form.name} onChange={set("name")} autoComplete="name" />
            </label>
            <label className="sfc-field">
              <span>موبایل یا ایمیل</span>
              <input required maxLength={160} value={form.contact} onChange={set("contact")} dir="ltr" autoComplete="tel" />
            </label>
          </div>
          <label className="sfc-field">
            <span>موضوع</span>
            <input maxLength={200} value={form.subject} onChange={set("subject")} />
          </label>
          <label className="sfc-field">
            <span>متن پیام</span>
            <textarea required rows={5} maxLength={2000} value={form.message} onChange={set("message")} />
          </label>
          <input
            className="sfc-contact__hp"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            name="website"
            value={hp}
            onChange={(e) => setHp(e.target.value)}
          />
          <button type="submit" className="sfc-btn" disabled={state === "busy"}>
            {state === "busy" ? "در حال ارسال…" : "ارسال پیام"}
          </button>
          {state === "ok" ? <p className="sfc-flash" role="status">پیام شما ثبت شد؛ به‌زودی پاسخ می‌دهیم.</p> : null}
          {state === "err" ? <p className="sfc-flash sfc-flash--err" role="alert">{error}</p> : null}
        </form>
      </div>
    </ClassicPageShell>
  )
}
