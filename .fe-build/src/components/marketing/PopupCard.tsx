"use client"

import { Copy, X } from "lucide-react"
import { useState } from "react"

export type PopupContent = {
  title?: string
  body?: string
  image_url?: string
  cta_label?: string
  cta_url?: string
  coupon_code?: string
  collect?: "none" | "phone" | "email"
  position?: "center" | "bottom" | "corner"
  theme?: {
    bg?: string
    text?: string
    accent?: string
    radius?: number
    overlay?: string
  }
}

type Props = {
  content: PopupContent
  onClose?: () => void
  onCta?: () => void
  onLead?: (value: string) => Promise<boolean> | boolean
  className?: string
}

/** Storefront + admin preview card for marketing popups. */
export function PopupCard({ content, onClose, onCta, onLead, className }: Props) {
  const [lead, setLead] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [copied, setCopied] = useState(false)
  const theme = content.theme ?? {}
  const radius = Math.max(0, Math.min(32, theme.radius ?? 16))
  const bg = theme.bg || "#ffffff"
  const text = theme.text || "#0f172a"
  const accent = theme.accent || "#0f766e"

  async function submitLead() {
    if (!onLead || !lead.trim() || busy) return
    setBusy(true)
    try {
      const ok = await onLead(lead.trim())
      if (ok) {
        setDone(true)
        setLead("")
      }
    } finally {
      setBusy(false)
    }
  }

  async function copyCoupon() {
    if (!content.coupon_code) return
    try {
      await navigator.clipboard.writeText(content.coupon_code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className={`relative w-full max-w-md overflow-hidden shadow-xl ${className ?? ""}`}
      style={{ background: bg, color: text, borderRadius: radius }}
      role="document"
    >
      {onClose ? (
        <button
          type="button"
          aria-label="Close"
          className="absolute top-2 end-2 z-10 rounded-full bg-black/10 p-1.5 hover:bg-black/20"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      ) : null}
      {content.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={content.image_url} alt="" className="h-40 w-full object-cover" />
      ) : null}
      <div className="space-y-3 p-5">
        {content.title ? <h3 className="text-lg font-semibold leading-snug">{content.title}</h3> : null}
        {content.body ? <p className="text-sm leading-relaxed opacity-90 whitespace-pre-wrap">{content.body}</p> : null}
        {content.coupon_code ? (
          <button
            type="button"
            onClick={() => void copyCoupon()}
            className="flex w-full items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2 font-mono text-sm"
            style={{ borderColor: accent, color: accent }}
          >
            <span dir="ltr">{content.coupon_code}</span>
            <span className="inline-flex items-center gap-1 text-xs opacity-80">
              <Copy className="size-3.5" />
              {copied ? "✓" : ""}
            </span>
          </button>
        ) : null}
        {content.collect && content.collect !== "none" && !done ? (
          <div className="flex gap-2">
            <input
              className="h-9 min-w-0 flex-1 rounded-md border bg-transparent px-3 text-sm"
              style={{ borderColor: `${accent}55`, color: text }}
              dir="ltr"
              type={content.collect === "email" ? "email" : "tel"}
              placeholder={content.collect === "email" ? "email@example.com" : "09xxxxxxxxx"}
              value={lead}
              onChange={(e) => setLead(e.target.value)}
            />
            <button
              type="button"
              disabled={busy || !lead.trim()}
              className="h-9 shrink-0 rounded-md px-3 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: accent }}
              onClick={() => void submitLead()}
            >
              OK
            </button>
          </div>
        ) : null}
        {done ? <p className="text-xs opacity-80">✓</p> : null}
        {content.cta_label ? (
          content.cta_url ? (
            <a
              href={content.cta_url}
              className="inline-flex h-10 w-full items-center justify-center rounded-md text-sm font-medium text-white"
              style={{ background: accent, borderRadius: Math.max(6, radius / 2) }}
              onClick={onCta}
            >
              {content.cta_label}
            </a>
          ) : (
            <button
              type="button"
              className="inline-flex h-10 w-full items-center justify-center rounded-md text-sm font-medium text-white"
              style={{ background: accent, borderRadius: Math.max(6, radius / 2) }}
              onClick={onCta}
            >
              {content.cta_label}
            </button>
          )
        ) : null}
      </div>
    </div>
  )
}
