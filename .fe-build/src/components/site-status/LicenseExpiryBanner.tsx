"use client"

import { useEffect, useState } from "react"

import { type LicenseRenewal, faDate, parseRenewal, renewalPath, safeHttps, shouldShowBanner } from "@/lib/license-renewal"

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ""

/**
 * Admin shell banner: shown when the ERP says `banner.show` (status expiring ≤7 days, expired or suspended;
 * license-renewal API.md §1). Message and level come from the ERP; the link is the signed `renew_url`.
 */
export function LicenseExpiryBanner() {
  const [r, setR] = useState<LicenseRenewal | null>(null)

  useEffect(() => {
    let alive = true
    const returnUrl = `${window.location.origin}/dashboard`
    fetch(`${API_BASE}${renewalPath(returnUrl)}`, { headers: { Accept: "application/json" }, cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((j) => alive && setR(parseRenewal(j)))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  if (!r || !shouldShowBanner(r) || !r.banner) return null
  const danger = r.banner.level === "danger"
  const href = r.renewable ? safeHttps(r.renew_url) : null
  const exp = faDate(r.expires_at)

  return (
    <div
      dir="rtl"
      role="status"
      data-testid="license-expiry-banner"
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3 text-sm ${
        danger ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <span className="font-bold">{r.banner.message}</span>
      {exp ? <span className="opacity-80">تاریخ انقضا: {exp}</span> : null}
      {r.plan ? <span className="opacity-80">پلن: {r.plan.name}</span> : null}
      {href ? (
        <a
          href={href}
          className={`ms-auto rounded-lg px-3 py-1.5 font-bold text-white ${danger ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"}`}
        >
          تمدید لایسنس
        </a>
      ) : null}
    </div>
  )
}
