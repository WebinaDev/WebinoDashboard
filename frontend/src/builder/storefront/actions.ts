"use client"

import { useCallback, useEffect, useState } from "react"

import { addToCart } from "../cart"
import type { ShopProduct } from "../catalog"
import { CART_EVENT, notifyCart, quietApi } from "./session"

export type ServerCartItem = {
  id: number
  quantity: number
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
  lines?: { id: number; unit_price_minor: number; line_total_minor: number }[]
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
export async function addShopItem(product: ShopProduct, qty = 1): Promise<AddShopResult> {
  const safeQty = Math.max(1, Math.min(99, Math.round(qty)))
  const localLine = {
    slug: product.slug,
    name: product.name,
    price: product.price,
    tone: product.tone,
    image: product.image,
    productId: product.id,
  }
  if (product.id) {
    const res = await quietApi<ServerCart>("/api/v1/cart/items", {
      method: "POST",
      json: { product_id: product.id, quantity: safeQty },
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

export async function setServerQty(productId: number, quantity: number) {
  const res = await quietApi<ServerCart>(`/api/v1/cart/items/${productId}`, {
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
      json: { product_id: line.productId, quantity: line.qty },
    })
    if (res.ok) synced += 1
  }
  if (synced > 0) {
    clearCart()
    notifyCart()
  }
}
