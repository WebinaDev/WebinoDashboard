/**
 * License renewal — client for the ERP public contract (WebinoERP license-renewal/API.md §1–2),
 * read through the same-origin proxy `GET /api/v1/public/license-renewal` (tenant domain is server-side).
 * Only fields defined in the contract are used here.
 */

export type LicenseStatus = "active" | "expiring" | "expired" | "suspended" | "cancelled"

export type RenewalOption = {
  id: number
  months: number
  label: string
  price_irr: number
  discount_percent: number | null
  final_irr: number
  final_toman: number
  new_expires_at: string
  checkout_url: string
}

export type LicenseRenewal = {
  domain: string
  product: string
  plan: { code: string; name: string } | null
  status: LicenseStatus
  expires_at: string | null
  days_left: number | null
  site_status: "active" | "suspended" | "coming_soon" | null
  renewable: boolean
  banner: { show: boolean; level: "warning" | "danger"; message: string } | null
  currency: string
  options: RenewalOption[]
  renew_url: string | null
  url_expires_at: string | null
}

export const RENEWAL_ENDPOINT = "/api/v1/public/license-renewal"
export const POLL_INTERVAL_MS = 3000
export const POLL_TIMEOUT_MS = 30000

export function renewalPath(returnUrl?: string | null): string {
  return returnUrl ? `${RENEWAL_ENDPOINT}?return_url=${encodeURIComponent(returnUrl)}` : RENEWAL_ENDPOINT
}

/** Extracts `data` from the raw ERP body or the Dashboard `{success,data}` envelope. */
export function parseRenewal(body: unknown): LicenseRenewal | null {
  const d = (body as { data?: unknown } | null)?.data
  if (!d || typeof d !== "object") return null
  const r = d as Partial<LicenseRenewal>
  if (typeof r.status !== "string") return null
  return { ...(r as LicenseRenewal), options: Array.isArray(r.options) ? r.options : [] }
}

/** API.md §2: reload once status is no longer expired/suspended. */
export function isRestored(r: LicenseRenewal | null): boolean {
  return !!r && r.status !== "expired" && r.status !== "suspended"
}

/** Gateway return params (API.md §2): `?payment_id=&status=settled|failed|cancelled&...`. */
export type PaymentReturn = { paymentId: string; status: "settled" | "failed" | "cancelled" | string }

export function readPaymentReturn(search: string): PaymentReturn | null {
  const q = new URLSearchParams(search)
  const paymentId = q.get("payment_id")
  const status = q.get("status")
  return paymentId && status ? { paymentId, status } : null
}

/** URL without the gateway params, so a reload does not re-trigger polling. */
export function stripPaymentParams(href: string): string {
  const u = new URL(href)
  for (const k of [...u.searchParams.keys()]) {
    if (["payment_id", "status", "gateway", "amount", "sig"].includes(k)) u.searchParams.delete(k)
  }
  return u.toString()
}

/** Button target: the signed ERP page (API.md: "Use this for the Suspended page button"). */
export function renewTarget(r: LicenseRenewal | null, fallback?: string | null): string | null {
  return r?.renew_url || fallback || null
}

/** Admin banner visibility: driven by the ERP `banner` object only. */
export function shouldShowBanner(r: LicenseRenewal | null): boolean {
  return !!r?.banner?.show
}

/** Only https URLs from the API are used as hrefs. */
export function safeHttps(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).protocol === "https:" ? url : null
  } catch {
    return null
  }
}

export function faDate(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "long", timeZone: "Asia/Tehran" }).format(d)
}

export function faToman(n: number): string {
  return `${new Intl.NumberFormat("fa-IR").format(n)} تومان`
}

export function faNumber(n: number): string {
  return new Intl.NumberFormat("fa-IR").format(n)
}

export const STATUS_LABEL: Record<LicenseStatus, string> = {
  active: "فعال",
  expiring: "نزدیک به انقضا",
  expired: "منقضی‌شده",
  suspended: "معلق",
  cancelled: "لغوشده",
}
