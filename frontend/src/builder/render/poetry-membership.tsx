"use client"

/* Membership state + premium lock UI shared by the poetry widgets.
 * Backend (WebinoDashboard 30699b6): public rows carry `is_premium` and `locked`; locked rows have no text or file URL. */

import Link from "next/link"
import { Lock } from "lucide-react"
import { useEffect, useState } from "react"
import type { ReactNode } from "react"

import type { MediaEntry } from "../poetry-media"
import { propStr } from "../props"
import "./poetry-premium.css"

type P = Record<string, unknown>
function apiV1(path: string): string {
  const raw = (process.env.NEXT_PUBLIC_API_URL ?? "").trim().replace(/\/+$/, "").replace(/\/api$/, "")
  return `${raw}/api/v1/${path.replace(/^\/+/, "")}`
}
const safe = (h: string, fb: string) => { const v = (h || "").trim(); return v && /^(https?:|\/|#|\?)/i.test(v) ? v : fb }

/* ───────────── membership ─────────────
 * GET /v1/public/membership  → { enabled, plans[], features[], discount_percent, downloads{free_audio,free_video,period} }
 * GET /v1/account/membership → { is_premium, premium_until, days_left, downloads{audio{unlimited,limit,used,remaining}} } (401 for guests)
 * Session goes with `credentials: include` (same cookie the storefront account uses). Missing endpoints = unknown, nobody is a member. */
export type Membership = { known: boolean; enabled: boolean; loggedIn: boolean; isMember: boolean; remaining: number | null; unlimited: boolean; freeDownloads: number | null }
const NO_MEMBERSHIP: Membership = { known: false, enabled: false, loggedIn: false, isMember: false, remaining: null, unlimited: false, freeDownloads: null }
export const JSON_HEADERS = { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" }
async function getData(path: string): Promise<{ status: number; data: Record<string, unknown> | null }> {
  try {
    const r = await fetch(apiV1(path), { headers: JSON_HEADERS, credentials: "include" })
    if (!r.ok) return { status: r.status, data: null }
    const j = (await r.json()) as { data?: Record<string, unknown> }
    return { status: r.status, data: j.data ?? null }
  } catch { return { status: 0, data: null } }
}
let membershipReq: Promise<Membership> | null = null
export function loadMembership(): Promise<Membership> {
  membershipReq ??= Promise.all([getData("public/membership"), getData("account/membership")]).then(([pub, me]) => {
    if (!pub.data && !me.data) return NO_MEMBERSHIP
    const dl = (pub.data?.downloads ?? {}) as Record<string, unknown>
    const mdl = ((me.data?.downloads ?? {}) as Record<string, Record<string, unknown>>).audio ?? {}
    return {
      known: true,
      enabled: pub.data ? !!pub.data.enabled : !!me.data?.enabled,
      loggedIn: !!me.data,
      isMember: !!me.data?.is_premium,
      unlimited: !!mdl.unlimited,
      remaining: typeof mdl.remaining === "number" ? mdl.remaining : null,
      freeDownloads: typeof dl.free_audio === "number" ? dl.free_audio : null,
    }
  })
  return membershipReq
}
/** After a download the quota changed; next read refetches. */
export const resetMembership = () => { membershipReq = null }
export function useMembership(): Membership {
  const [m, setM] = useState<Membership>(NO_MEMBERSHIP)
  useEffect(() => { let off = false; void loadMembership().then((v) => { if (!off) setM(v) }); return () => { off = true } }, [])
  return m
}

/** Backend sends `locked` (premium row, visitor without access: text/file stripped). */
export function poemLocked(c: { locked?: boolean | null; premium_locked?: boolean | null } | null | undefined): boolean {
  return !!(c && (c.locked ?? c.premium_locked))
}
export const mediaLocked = (m: MediaEntry) => !!m.locked

export function hasLocked(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(hasLocked)
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  return o.locked === true || hasLocked(o.poems) || hasLocked(o.media) || hasLocked(o.items)
}
/** Blurred content + lock CTA. Name/info are rendered by the caller outside this veil. */
export function PremiumVeil({ p, children, compact = false, note }: { p: P; children?: ReactNode; compact?: boolean; note?: string }) {
  return (
    <div className={`wpv-veil ${compact ? "wpv-veil-sm" : ""}`}>
      <div className="wpv-veil-blur" aria-hidden>{children ?? <><i /><i /><i /><i /></>}</div>
      <div className="wpv-veil-cta">
        <span className="wpv-veil-ic"><Lock size={compact ? 14 : 18} aria-hidden /></span>
        {compact ? null : <b>{propStr(p, "premiumTitle", "محتوای ویژه اعضا")}</b>}
        {!compact && note ? <small>{note}</small> : null}
        <Link href={safe(propStr(p, "premiumHref", "/subscribe"), "/subscribe")} className="wpv-veil-btn">{propStr(p, "premiumLabel", "خرید اشتراک ویژه")}</Link>
      </div>
    </div>
  )
}
export function PremiumBadge() {
  return <span className="wpv-badge"><Lock size={11} aria-hidden />ویژه</span>
}
