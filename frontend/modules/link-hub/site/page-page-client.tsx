"use client"

import { useEffect, useMemo, useState } from "react"

import "./link-hub-public.css"

type PublicBlock = {
  id: number
  type: string
  payload: Record<string, unknown>
}

type PublicPage = {
  profile: {
    id?: number
    title: string
    avatar_url?: string | null
    bio?: string | null
    theme_json?: Record<string, unknown> | null
    slug?: string | null
  }
  blocks: PublicBlock[]
}

type SocialIcon = {
  src?: string
  tint?: boolean
  photo?: boolean
  solid?: string
  color?: string
}

const SOCIAL_ICONS: Record<string, SocialIcon> = {
  instagram: { src: "/brand/connect/instagram.svg", tint: true, color: "#E4405F" },
  اینستاگرام: { src: "/brand/connect/instagram.svg", tint: true, color: "#E4405F" },
  telegram: { src: "/brand/connect/telegram.svg", tint: true, color: "#26A5E4" },
  تلگرام: { src: "/brand/connect/telegram.svg", tint: true, color: "#26A5E4" },
  whatsapp: { src: "/brand/connect/whatsapp.svg", tint: true, color: "#25D366" },
  واتساپ: { src: "/brand/connect/whatsapp.svg", tint: true, color: "#25D366" },
  linkedin: { src: "/brand/connect/linkedin.svg", tint: true, color: "#0A66C2" },
  لینکدین: { src: "/brand/connect/linkedin.svg", tint: true, color: "#0A66C2" },
  bale: { src: "/brand/connect/bale.png", photo: true, color: "#00A651" },
  بله: { src: "/brand/connect/bale.png", photo: true, color: "#00A651" },
  eitaa: { src: "/brand/connect/eitaa.png", photo: true, color: "#FF7534" },
  ایتا: { src: "/brand/connect/eitaa.png", photo: true, color: "#FF7534" },
  rubika: { src: "/brand/connect/rubika.png", photo: true, color: "#7B2D8E" },
  روبیکا: { src: "/brand/connect/rubika.png", photo: true, color: "#7B2D8E" },
  gap: { src: "/brand/connect/gap.png", photo: true, color: "#1E88E5" },
  گپ: { src: "/brand/connect/gap.png", photo: true, color: "#1E88E5" },
  igap: { src: "/brand/connect/igap.png", photo: true, color: "#00BFA5" },
  آیگپ: { src: "/brand/connect/igap.png", photo: true, color: "#00BFA5" },
}

function resolveIcon(label: string, url: string): SocialIcon {
  const key = label.trim().toLowerCase()
  for (const [name, icon] of Object.entries(SOCIAL_ICONS)) {
    if (key.includes(name.toLowerCase()) || url.toLowerCase().includes(name.toLowerCase())) {
      return icon
    }
  }
  if (url.includes("t.me") || url.includes("telegram")) return SOCIAL_ICONS.telegram
  if (url.includes("wa.me") || url.includes("whatsapp")) return SOCIAL_ICONS.whatsapp
  if (url.includes("instagram")) return SOCIAL_ICONS.instagram
  if (url.includes("linkedin")) return SOCIAL_ICONS.linkedin
  if (url.includes("ble.ir") || url.includes("bale")) return SOCIAL_ICONS.bale
  return { solid: (label || "لینک").slice(0, 1) }
}

function tenantHeaders(): HeadersInit {
  const host = typeof window !== "undefined" ? window.location.host.replace(/:\d+$/, "") : ""
  return {
    Accept: "application/json",
    ...(host ? { "X-Tenant-Domain": host } : {}),
  }
}

async function postEvent(path: string, body: Record<string, unknown>) {
  try {
    await fetch(`/api/v1/public/link-hub/events/${path}`, {
      method: "POST",
      headers: { ...tenantHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    })
  } catch {
    /* ignore analytics failures */
  }
}

export default function LinkHubPublicPage({ slug }: { slug?: string }) {
  const [page, setPage] = useState<PublicPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState<number | null>(null)
  const [done, setDone] = useState<Record<number, boolean>>({})

  const qs = useMemo(() => (slug ? `?slug=${encodeURIComponent(slug)}` : ""), [slug])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/v1/public/link-hub/page${qs}`, {
          headers: tenantHeaders(),
          cache: "no-store",
        })
        const json = (await res.json()) as { data?: PublicPage; message?: string }
        if (!res.ok || !json.data) {
          if (!cancelled) setError(json.message || "صفحه یافت نشد.")
          return
        }
        if (!cancelled) {
          setPage(json.data)
          void postEvent("view", { slug: slug || null })
        }
      } catch {
        if (!cancelled) setError("خطا در بارگذاری صفحه.")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [qs, slug])

  const accent = String(page?.profile.theme_json?.accent ?? "#0f766e")
  const background = String(page?.profile.theme_json?.background ?? "#f1f5f9")

  async function submitForm(blockId: number, form: HTMLFormElement) {
    const fd = new FormData(form)
    const fields: Record<string, string> = {}
    fd.forEach((value, key) => {
      fields[key] = String(value)
    })
    setSending(blockId)
    try {
      const res = await fetch(`/api/v1/public/link-hub/forms/${blockId}/submit`, {
        method: "POST",
        headers: { ...tenantHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      })
      if (!res.ok) throw new Error("fail")
      setDone((prev) => ({ ...prev, [blockId]: true }))
      form.reset()
    } catch {
      setError("ارسال فرم ناموفق بود.")
    } finally {
      setSending(null)
    }
  }

  function trackClick(blockId: number, target?: string) {
    void postEvent("click", { slug: slug || null, block_id: blockId, target: target || null })
  }

  if (error && !page) {
    return (
      <div className="lh-center">
        <p>{error}</p>
      </div>
    )
  }

  if (!page) {
    return (
      <div className="lh-center">
        <p>در حال بارگذاری…</p>
      </div>
    )
  }

  return (
    <div
      className="lh-page"
      style={{ ["--lh-accent" as string]: accent, ["--lh-bg" as string]: background }}
      dir="rtl"
    >
      <div className="lh-atmos" aria-hidden />
      <div className="lh-shell">
        <aside className="lh-aside">
          <header className="lh-brand">
            {page.profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={page.profile.avatar_url} alt="" className="lh-avatar" />
            ) : (
              <div className="lh-avatar-fallback">{(page.profile.title || "?").slice(0, 1)}</div>
            )}
            <h1 className="lh-title">{page.profile.title}</h1>
            {page.profile.bio ? <p className="lh-bio">{page.profile.bio}</p> : null}
          </header>
        </aside>

        <main className="lh-main">
          {page.blocks.map((block) => (
            <BlockView
              key={block.id}
              block={block}
              sending={sending === block.id}
              done={Boolean(done[block.id])}
              onSubmit={(form) => submitForm(block.id, form)}
              onClickTrack={(target) => trackClick(block.id, target)}
            />
          ))}
        </main>
      </div>
    </div>
  )
}

function BlockView({
  block,
  sending,
  done,
  onSubmit,
  onClickTrack,
}: {
  block: PublicBlock
  sending: boolean
  done: boolean
  onSubmit: (form: HTMLFormElement) => void
  onClickTrack: (target?: string) => void
}) {
  const p = block.payload

  if (block.type === "link") {
    const url = String(p.url || "#")
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="lh-block lh-link"
        onClick={() => onClickTrack(url)}
      >
        {String(p.label || "لینک")}
      </a>
    )
  }

  if (block.type === "contact") {
    const socials = Array.isArray(p.socials) ? p.socials : []
    return (
      <div className="lh-block lh-contact">
        {p.phone ? (
          <a
            className="lh-contact-row"
            href={`tel:${String(p.phone)}`}
            onClick={() => onClickTrack(`tel:${String(p.phone)}`)}
          >
            <span className="lh-contact-icon is-solid">ت</span>
            <span className="lh-contact-meta">
              <span className="lh-contact-label">تلفن</span>
              <span className="lh-contact-value" dir="ltr">
                {String(p.phone)}
              </span>
            </span>
          </a>
        ) : null}
        {p.email ? (
          <a
            className="lh-contact-row"
            href={`mailto:${String(p.email)}`}
            onClick={() => onClickTrack(`mailto:${String(p.email)}`)}
          >
            <span className="lh-contact-icon is-solid">@</span>
            <span className="lh-contact-meta">
              <span className="lh-contact-label">ایمیل</span>
              <span className="lh-contact-value" dir="ltr">
                {String(p.email)}
              </span>
            </span>
          </a>
        ) : null}
        {socials.map((item, i) => {
          const row = item as { label?: string; url?: string }
          const label = row.label || row.url || "لینک"
          const url = row.url || "#"
          const icon = resolveIcon(label, url)
          return (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="lh-contact-row"
              onClick={() => onClickTrack(url)}
            >
              <span
                className={`lh-contact-icon${icon.tint ? " is-tint" : ""}${icon.photo ? " is-photo" : ""}${icon.solid ? " is-solid" : ""}`}
                style={icon.color ? ({ ["--lh-brand" as string]: icon.color }) : undefined}
              >
                {icon.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={icon.src} alt="" />
                ) : (
                  icon.solid
                )}
              </span>
              <span className="lh-contact-meta">
                <span className="lh-contact-label">{label}</span>
                <span className="lh-contact-value" dir="ltr">
                  {url.replace(/^https?:\/\//, "")}
                </span>
              </span>
            </a>
          )
        })}
      </div>
    )
  }

  if (block.type === "faq") {
    const items = Array.isArray(p.items) ? p.items : []
    return (
      <div className="lh-block lh-faq">
        <h2>{String(p.title || "سوالات متداول")}</h2>
        {items.map((item, i) => {
          const row = item as { q?: string; a?: string }
          return (
            <details key={i}>
              <summary>{row.q}</summary>
              <p>{row.a}</p>
            </details>
          )
        })}
      </div>
    )
  }

  if (block.type === "event") {
    const url = p.cta_url ? String(p.cta_url) : ""
    return (
      <div className="lh-block lh-event">
        <div className="lh-event-kicker">رویداد</div>
        <h3>{String(p.title || "")}</h3>
        {p.datetime ? <p className="lh-event-time">{String(p.datetime)}</p> : null}
        {url ? (
          <a
            href={url}
            className="lh-event-cta"
            target="_blank"
            rel="noreferrer"
            onClick={() => onClickTrack(url)}
          >
            {String(p.cta_label || "جزئیات")}
          </a>
        ) : null}
      </div>
    )
  }

  if (block.type === "form") {
    const fields = Array.isArray(p.fields) ? p.fields : []
    return (
      <form
        className="lh-block lh-form"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(e.currentTarget)
        }}
      >
        <h2>{String(p.title || "فرم")}</h2>
        {fields.map((field) => {
          const f = field as { name?: string; label?: string; type?: string; required?: boolean }
          const name = f.name || "field"
          const common = {
            name,
            required: Boolean(f.required),
            placeholder: f.label || name,
          }
          if (f.type === "textarea") {
            return <textarea key={name} {...common} rows={3} />
          }
          return <input key={name} type={f.type || "text"} {...common} />
        })}
        <button type="submit" disabled={sending || done}>
          {done ? "ارسال شد" : sending ? "در حال ارسال…" : String(p.submit_label || "ارسال")}
        </button>
      </form>
    )
  }

  return null
}
