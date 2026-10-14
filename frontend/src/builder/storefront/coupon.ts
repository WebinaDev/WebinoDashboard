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
