"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { trackAnalyticsEvent } from "@/lib/analytics-track"
import { api } from "@/lib/api"

export type CartLine = {
  id: number
  quantity: number
  meta?: { unit_minor?: number; selections?: { name_fa?: string; name_en?: string }[] } | null
  product?: { id: number; name: string; price_minor: number; currency: string; image_url?: string | null }
}

export type GuestCart = {
  id?: number
  guest_token?: string | null
  table_number?: string | null
  items?: CartLine[]
  /** Server quote following the cafe menu settings (fees + tax). */
  totals?: {
    fulfillment: string
    subtotal_minor: number
    packaging_minor: number
    delivery_minor: number
    service_minor: number
    fees_minor: number
    tax_minor: number
    tax_added_minor: number
    vat_rate?: number
    vat_inclusive?: boolean
    show_vat?: boolean
    grand_total_minor: number
  }
}

export const TOKEN_KEY = "cafe_guest_token"

export function getGuestToken(): string {
  if (typeof window === "undefined") return ""
  let token = localStorage.getItem(TOKEN_KEY)
  if (!token) {
    token = crypto.randomUUID().replace(/-/g, "")
    localStorage.setItem(TOKEN_KEY, token)
  }
  return token
}

export function useGuestCart(tableNumber?: string | null, branchSlug?: string | null, fulfillment?: string | null) {
  const [token, setToken] = useState("")
  useEffect(() => {
    setToken(getGuestToken())
  }, [])
  const query = useQuery({
    queryKey: ["guest-cart", token, tableNumber ?? "", branchSlug ?? "", fulfillment ?? ""],
    enabled: Boolean(token),
    queryFn: () =>
      api<GuestCart>(
        `/api/v1/public/cafe/cart?guest_token=${encodeURIComponent(token)}&table=${encodeURIComponent(tableNumber ?? "")}&branch=${encodeURIComponent(branchSlug ?? "")}${fulfillment ? `&fulfillment=${encodeURIComponent(fulfillment)}` : ""}`,
      ),
  })
  const cart = query.data
  const count = cart?.items?.reduce((sum, line) => sum + line.quantity, 0) ?? 0
  const subtotal =
    cart?.items?.reduce((sum, line) => sum + line.quantity * (line.meta?.unit_minor ?? line.product?.price_minor ?? 0), 0) ?? 0
  return { token, cart, count, subtotal, totals: cart?.totals, isLoading: query.isLoading }
}

export function useAddToCart(tableNumber?: string | null, branchSlug?: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { productId: number; quantity: number; optionIds: number[]; variantId: number | null }) => {
      const token = getGuestToken()
      return api<GuestCart>("/api/v1/public/cafe/cart/items", {
        method: "POST",
        json: {
          product_id: input.productId,
          quantity: input.quantity,
          guest_token: token,
          table_number: tableNumber,
          branch_slug: branchSlug,
          option_ids: input.optionIds,
          variant_id: input.variantId,
        },
      })
    },
    onSuccess: async (_data, input) => {
      trackAnalyticsEvent("add_to_cart", { productId: input.productId })
      await queryClient.invalidateQueries({ queryKey: ["guest-cart"] })
    },
  })
}
