"use client"

import { useEffect, useMemo, useState } from "react"

import { LinkHubView, type PublicPage } from "../lib/LinkHubView"

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

export default function LinkHubPublicPage({ slug, initial }: { slug?: string; initial?: PublicPage | null }) {
  const [page, setPage] = useState<PublicPage | null>(initial ?? null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState<number | null>(null)
  const [done, setDone] = useState<Record<number, boolean>>({})

  const qs = useMemo(() => (slug ? `?slug=${encodeURIComponent(slug)}` : ""), [slug])

  useEffect(() => {
    let cancelled = false
    if (initial) {
      void postEvent("view", { slug: slug || null })
      return
    }
    ;(async () => {
      try {
        const res = await fetch(`/api/v1/public/link-hub/page${qs}`, { headers: tenantHeaders(), cache: "no-store" })
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
  }, [qs, slug, initial])

  async function submitForm(blockId: number, form: HTMLFormElement) {
    const fd = new FormData(form)
    const fields: Record<string, string> = {}
    fd.forEach((value, key) => {
      fields[key] = String(value)
    })
    setSending(blockId)
    setError(null)
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

  if (!page) {
    return (
      <div className="lh-center" dir="rtl">
        <p>{error ?? "در حال بارگذاری…"}</p>
      </div>
    )
  }

  return (
    <LinkHubView
      page={page}
      handlers={{
        sending,
        done,
        onSubmit: submitForm,
        onClickTrack: (blockId, target) =>
          void postEvent("click", { slug: slug || null, block_id: blockId, target: target || null }),
      }}
      footer={
        error ? (
          <p className="lh-note" role="alert">
            {error}
          </p>
        ) : null
      }
    />
  )
}
