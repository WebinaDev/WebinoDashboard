"use client"

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
}

/** Presentational popup body shared by the admin preview and the storefront runtime. Uses theme CSS vars (accent-aware). */
export function PopupCard({
  content,
  onClose,
  onCta,
  onLead,
}: {
  content: PopupContent
  onClose: () => void
  onCta?: () => void
  onLead?: (value: string) => Promise<boolean> | boolean
}) {
  const [value, setValue] = useState("")
  const [done, setDone] = useState(false)
  const [copied, setCopied] = useState(false)
  const collect = content.collect ?? "none"
  return (
    <div dir="rtl" className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white text-slate-800 shadow-2xl" style={{ fontFamily: "inherit" }}>
      <button type="button" aria-label="بستن" onClick={onClose} className="absolute left-2 top-2 z-10 flex size-8 items-center justify-center rounded-full bg-black/40 text-lg leading-none text-white">×</button>
      {content.image_url ? <img src={content.image_url} alt="" className="max-h-56 w-full object-cover" /> : null}
      <div className="space-y-3 p-5 text-center">
        {content.title ? <h3 className="text-lg font-bold">{content.title}</h3> : null}
        {content.body ? <p className="whitespace-pre-line text-sm leading-7 text-slate-600">{content.body}</p> : null}
        {content.coupon_code ? (
          <button
            type="button"
            dir="ltr"
            className="w-full rounded-lg border-2 border-dashed px-3 py-2 font-mono font-bold tracking-widest"
            style={{ borderColor: "var(--primary, #ef4056)", color: "var(--primary, #ef4056)" }}
            onClick={() => {
              void navigator.clipboard?.writeText(content.coupon_code ?? "")
              setCopied(true)
            }}
          >
            {copied ? "کپی شد ✓" : content.coupon_code}
          </button>
        ) : null}
        {collect !== "none" && onLead !== undefined ? (
          done ? (
            <p className="text-sm font-medium text-emerald-600">عضویت شما ثبت شد.</p>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault()
                const v = value.trim()
                const ok = collect === "email" ? /.+@.+\..+/.test(v) : /^(\+98|0)?9\d{9}$/.test(v.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))))
                if (!ok) return
                if (await onLead(v)) setDone(true)
              }}
            >
              <input
                dir="ltr"
                inputMode={collect === "email" ? "email" : "tel"}
                placeholder={collect === "email" ? "ایمیل" : "۰۹۱۲۳۴۵۶۷۸۹"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-10 min-w-0 flex-1 rounded-lg border px-3 text-sm"
              />
              <button type="submit" className="h-10 rounded-lg px-4 text-sm font-medium text-white" style={{ background: "var(--primary, #ef4056)" }}>عضویت</button>
            </form>
          )
        ) : null}
        {content.cta_label && content.cta_url ? (
          <a href={content.cta_url} onClick={onCta} className="block rounded-lg px-4 py-2.5 text-sm font-medium text-white" style={{ background: "var(--primary, #ef4056)" }}>
            {content.cta_label}
          </a>
        ) : null}
      </div>
    </div>
  )
}
