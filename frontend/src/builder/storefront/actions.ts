"use client"

import { useCallback, useEffect, useState } from "react"

import { addToCart } from "../cart"
import type { ShopProduct } from "../catalog"
import { CART_EVENT, notifyCart, quietApi } from "./session"

export type ServerCartItem = {
  id: number
  quantity: number
  product_variant_id?: number | null
  variant?: { id: number; name?: string | null; image_url?: string | null } | null
  product: {
    id: number
    name: string
    price_minor: number
    slug?: string
    image_url?: string | null
    cover_image_url?: string | null
  }
}

export type ServerCartPricing = {
  active?: boolean
  purchase_type?: string
  installment_months?: number | null
  installment_monthly_minor?: number | null
  available_types?: string[]
  installment_plans?: { months: number; interest?: number }[]
  subtotal_minor?: number
  single_price?: boolean
  lines?: ServerPricingLine[]
}

export type ServerPricingLine = {
  id: number
  product_id?: number
  product_variant_id?: number | null
  unit_price_minor: number
  regular_price_minor?: number
  on_sale?: boolean
  line_total_minor: number
}

/** Unit + regular (struck-through) price of a server cart line, from pricing.lines[]. */
export function serverLinePrice(cart: ServerCart | null | undefined, line: ServerCartItem): { price: number; regular: number } {
  const row = cart?.pricing?.lines?.find((r) => r.id === line.id)
  const price = row?.unit_price_minor ?? line.product.price_minor
  const regular = row?.on_sale && row.regular_price_minor && row.regular_price_minor > price ? row.regular_price_minor : 0
  return { price, regular }
}

export type ServerCart = {
  id: number
  items: ServerCartItem[]
  pricing?: ServerCartPricing
}

export function useServerCart() {
  const [cart, setCart] = useState<ServerCart | null>(null)
  const [auth, setAuth] = useState<"loading" | "auth" | "guest">("loading")

  const reload = useCallback(async () => {
    const res = await quietApi<ServerCart>("/api/v1/cart")
    if (!res.ok) {
      setAuth(res.status === 401 || res.status === 403 ? "guest" : "guest")
      setCart(null)
      return
    }
    setAuth("auth")
    setCart(res.data)
  }, [])

  useEffect(() => {
    void reload()
    // Never leave the cart on "loading": a hung request falls back to the guest (local) cart.
    const timer = window.setTimeout(() => setAuth((a) => (a === "loading" ? "guest" : a)), 8000)
    return () => window.clearTimeout(timer)
  }, [reload])

  useEffect(() => {
    const onChange = () => void reload()
    window.addEventListener(CART_EVENT, onChange)
    return () => window.removeEventListener(CART_EVENT, onChange)
  }, [reload])

  return { cart, auth, reload }
}

export type AddShopResult = "server" | "local" | "error"

/** Add to the signed-in server cart when possible; otherwise the guest localStorage cart. */
export async function addShopItem(product: ShopProduct, qty = 1, variantId?: number | null): Promise<AddShopResult> {
  const safeQty = Math.max(1, Math.min(99, Math.round(qty)))
  const variant = variantId ? product.variants?.find((v) => v.id === variantId) ?? null : null
  const price = variant?.price || product.price
  const compare = variant ? variant.compare : product.compare
  const localLine = {
    slug: product.slug,
    name: product.name,
    price,
    ...(compare && compare > price ? { compare } : {}),
    tone: product.tone,
    image: variant?.image || product.image,
    productId: product.id,
    ...(variant ? { variantId: variant.id, variantName: variant.name } : {}),
  }
  if (product.id) {
    const res = await quietApi<ServerCart>("/api/v1/cart/items", {
      method: "POST",
      json: { product_id: product.id, quantity: safeQty, ...(variantId ? { variant_id: variantId } : {}) },
    })
    if (res.ok) {
      notifyCart()
      return "server"
    }
    if (res.status !== 401 && res.status !== 403) return "error"
  }
  addToCart(localLine, safeQty)
  notifyCart()
  return "local"
}

export async function setServerQty(productId: number, quantity: number, variantId?: number | null) {
  const res = await quietApi<ServerCart>(`/api/v1/cart/items/${productId}${variantId ? `?variant_id=${variantId}` : ""}`, {
    method: "PUT",
    json: { quantity: Math.max(0, Math.min(999, Math.round(quantity))) },
  })
  if (res.ok) notifyCart()
  return res
}

export async function syncGuestCart() {
  const { cartSnapshot, clearCart } = await import("../cart")
  const lines = cartSnapshot().filter((line) => line.productId)
  if (!lines.length) return
  let synced = 0
  for (const line of lines) {
    const res = await quietApi("/api/v1/cart/items", {
      method: "POST",
      json: { product_id: line.productId, quantity: line.qty, ...(line.variantId ? { variant_id: line.variantId } : {}) },
    })
    if (res.ok) synced += 1
  }
  if (synced > 0) {
    clearCart()
    notifyCart()
  }
}

export async function removeServerItem(productId: number) {
  const res = await quietApi(`/api/v1/cart/items/${productId}`, { method: "DELETE" })
  if (res.ok) notifyCart()
  return res
}

/** Quantity of one server cart line (0 removes it). */
export async function setServerLineQty(lineId: number, quantity: number) {
  const res = await quietApi<ServerCart>(`/api/v1/cart/lines/${lineId}`, {
    method: "PUT",
    json: { quantity: Math.max(0, Math.min(999, Math.round(quantity))) },
  })
  if (res.ok) notifyCart()
  return res
}

export async function removeServerLine(lineId: number) {
  const res = await quietApi(`/api/v1/cart/lines/${lineId}`, { method: "DELETE" })
  if (res.ok) notifyCart()
  return res
}

let guestFlag: Promise<boolean> | null = null

/** Store allows checkout without an account (public tenant guest_checkout flag). */
export function useGuestCheckoutAllowed(): boolean | null {
  const [allowed, setAllowed] = useState<boolean | null>(null)
  useEffect(() => {
    guestFlag ??= quietApi<{ guest_checkout?: boolean; data?: { guest_checkout?: boolean } }>("/api/v1/public/tenant").then((res) =>
      res.ok ? Boolean(res.data.guest_checkout ?? res.data.data?.guest_checkout) : false,
    )
    let live = true
    void guestFlag.then((v) => live && setAllowed(v))
    return () => {
      live = false
    }
  }, [])
  return allowed
}
