"use client"

import { quietApi } from "./session"

const COUPON_KEY = "wb_coupon"

export type CouponPreview = { code: string; discount_minor: number; free_shipping: boolean }

/** Coupon chosen in the cart; checkout pre-fills it and the server re-validates on order creation. */
export function readStoredCoupon(): string {
  if (typeof window === "undefined") return ""
  try {
    return window.localStorage.getItem(COUPON_KEY) ?? ""
  } catch {
    return ""
  }
}

export function storeCoupon(code: string | null): void {
  if (typeof window === "undefined") return
  try {
    if (code) window.localStorage.setItem(COUPON_KEY, code)
    else window.localStorage.removeItem(COUPON_KEY)
  } catch {
    /* storage unavailable */
  }
}

export async function previewCoupon(
  code: string,
  subtotalMinor: number,
): Promise<{ ok: true; data: CouponPreview } | { ok: false; message: string }> {
  const res = await quietApi<CouponPreview>("/api/v1/public/coupons/preview", {
    method: "POST",
    json: { code: code.trim(), subtotal_minor: Math.max(0, Math.round(subtotalMinor)) },
  })
  if (!res.ok) return { ok: false, message: res.message }
  const data = (res.data as { data?: CouponPreview }).data ?? res.data
  return { ok: true, data }
}

export type AvailableCoupon = {
  code: string
  description: string
  type: string
  amount: number
  min_spend_minor: number | null
  expires_at: string | null
  eligible: boolean
  discount_minor: number
  free_shipping: boolean
  reason: string | null
}

/** Merchant-opted-in coupons for the cart chooser, evaluated against the current subtotal. */
export async function fetchAvailableCoupons(subtotalMinor: number): Promise<AvailableCoupon[]> {
  const res = await quietApi<{ data?: AvailableCoupon[] }>("/api/v1/public/coupons/available", {
    method: "POST",
    json: { subtotal_minor: Math.max(0, Math.round(subtotalMinor)) },
  })
  if (!res.ok) return []
  const body = res.data as { data?: AvailableCoupon[] } | AvailableCoupon[]
  return Array.isArray(body) ? body : (body.data ?? [])
}
