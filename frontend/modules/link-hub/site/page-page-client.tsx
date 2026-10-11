"use client"

import { useEffect, useMemo, useState } from "react"

type PublicBlock = {
  id: number
  type: string
  payload: Record<string, unknown>
}

type PublicPage = {
  profile: {
    title: string
    avatar_url?: string | null
    bio?: string | null
    theme_json?: Record<string, unknown> | null
    slug?: string | null
  }
  blocks: PublicBlock[]
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
        const host = typeof window !== "undefined" ? window.location.host.replace(/:\d+$/, "") : ""
        const res = await fetch(`/api/v1/public/link-hub/page${qs}`, {
          headers: {
            Accept: "application/json",
            ...(host ? { "X-Tenant-Domain": host } : {}),
          },
          cache: "no-store",
        })
        const json = (await res.json()) as { data?: PublicPage; message?: string }
        if (!res.ok || !json.data) {
          if (!cancelled) setError(json.message || "صفحه یافت نشد.")
          return
        }
        if (!cancelled) setPage(json.data)
      } catch {
        if (!cancelled) setError("خطا در بارگذاری صفحه.")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [qs])

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
      const host = typeof window !== "undefined" ? window.location.host.replace(/:\d+$/, "") : ""
      const res = await fetch(`/api/v1/public/link-hub/forms/${blockId}/submit`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(host ? { "X-Tenant-Domain": host } : {}),
        },
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

  if (error && !page) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6 text-center">
        <p>{error}</p>
      </div>
    )
  }

  if (!page) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
        <p>در حال بارگذاری…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-8" style={{ background }} dir="rtl">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="flex flex-col items-center gap-3 text-center">
          {page.profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={page.profile.avatar_url}
              alt=""
              className="h-24 w-24 rounded-full object-cover shadow"
            />
          ) : (
            <div
              className="flex h-24 w-24 items-center justify-center rounded-full text-2xl font-bold text-white shadow"
              style={{ background: accent }}
            >
              {(page.profile.title || "?").slice(0, 1)}
            </div>
          )}
          <h1 className="text-2xl font-bold text-slate-900">{page.profile.title}</h1>
          {page.profile.bio ? <p className="text-sm leading-7 text-slate-600">{page.profile.bio}</p> : null}
        </header>

        <div className="flex flex-col gap-3">
          {page.blocks.map((block) => (
            <BlockView
              key={block.id}
              block={block}
              accent={accent}
              sending={sending === block.id}
              done={Boolean(done[block.id])}
              onSubmit={(form) => submitForm(block.id, form)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function BlockView({
  block,
  accent,
  sending,
  done,
  onSubmit,
}: {
  block: PublicBlock
  accent: string
  sending: boolean
  done: boolean
  onSubmit: (form: HTMLFormElement) => void
}) {
  const p = block.payload

  if (block.type === "link") {
    return (
      <a
        href={String(p.url || "#")}
        target="_blank"
        rel="noreferrer"
        className="block rounded-2xl bg-white px-4 py-3 text-center font-medium shadow-sm"
        style={{ color: accent }}
      >
        {String(p.label || "لینک")}
      </a>
    )
  }

  if (block.type === "contact") {
    const socials = Array.isArray(p.socials) ? p.socials : []
    return (
      <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
        {p.phone ? (
          <a className="block text-center" href={`tel:${String(p.phone)}`} style={{ color: accent }}>
            تماس: {String(p.phone)}
          </a>
        ) : null}
        {p.email ? (
          <a className="block text-center" href={`mailto:${String(p.email)}`} style={{ color: accent }}>
            ایمیل: {String(p.email)}
          </a>
        ) : null}
        {socials.map((item, i) => {
          const row = item as { label?: string; url?: string }
          return (
            <a
              key={i}
              href={row.url || "#"}
              target="_blank"
              rel="noreferrer"
              className="block rounded-xl border px-3 py-2 text-center text-sm"
            >
              {row.label || row.url}
            </a>
          )
        })}
      </div>
    )
  }

  if (block.type === "faq") {
    const items = Array.isArray(p.items) ? p.items : []
    return (
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">{String(p.title || "سوالات متداول")}</h2>
        <div className="space-y-2">
          {items.map((item, i) => {
            const row = item as { q?: string; a?: string }
            return (
              <details key={i} className="rounded-xl border px-3 py-2">
                <summary className="cursor-pointer font-medium">{row.q}</summary>
                <p className="text-muted-foreground mt-2 text-sm leading-6">{row.a}</p>
              </details>
            )
          })}
        </div>
      </div>
    )
  }

  if (block.type === "event") {
    return (
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-1 text-xs" style={{ color: accent }}>
          رویداد
        </div>
        <h3 className="font-semibold">{String(p.title || "")}</h3>
        {p.datetime ? <p className="text-muted-foreground mt-1 text-sm">{String(p.datetime)}</p> : null}
        {p.cta_url ? (
          <a
            href={String(p.cta_url)}
            className="mt-3 inline-flex rounded-xl px-4 py-2 text-sm font-medium text-white"
            style={{ background: accent }}
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
        className="space-y-3 rounded-2xl bg-white p-4 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(e.currentTarget)
        }}
      >
        <h2 className="font-semibold">{String(p.title || "فرم")}</h2>
        {fields.map((field) => {
          const f = field as { name?: string; label?: string; type?: string; required?: boolean }
          const name = f.name || "field"
          const common = {
            name,
            required: Boolean(f.required),
            className: "border-input w-full rounded-xl border px-3 py-2 text-sm",
            placeholder: f.label || name,
          }
          if (f.type === "textarea") {
            return <textarea key={name} {...common} rows={3} />
          }
          return <input key={name} type={f.type || "text"} {...common} />
        })}
        <button
          type="submit"
          disabled={sending || done}
          className="w-full rounded-xl py-2.5 text-sm font-medium text-white disabled:opacity-60"
          style={{ background: accent }}
        >
          {done ? "ارسال شد" : sending ? "در حال ارسال…" : String(p.submit_label || "ارسال")}
        </button>
      </form>
    )
  }

  return null
}
