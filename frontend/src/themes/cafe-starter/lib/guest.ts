"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"

import { getGuestToken } from "./cart"

export type GuestState = {
  verified: boolean
  phone: string | null
  masked: string | null
}

export type GuestOrderLine = {
  product_id: number | null
  name: string
  quantity: number
  unit_price_minor: number
  selections?: { name_fa?: string; name_en?: string; addon?: boolean }[]
}

export type GuestOrder = {
  id: number
  number: string | number
  status: string
  kitchen_status: string
  fulfillment: string
  table_number?: string | null
  delivery_window?: string | null
  customer_name?: string | null
  created_at?: string | null
  total_minor: number
  currency?: string | null
  items: GuestOrderLine[]
}

/** OTP state for the browser's guest token: masked phone + whether it is proven. */
export function useGuestState(enabled = true) {
  const token = typeof window === "undefined" ? "" : getGuestToken()
  return useQuery({
    queryKey: ["cafe-guest-state", token],
    enabled: enabled && Boolean(token),
    queryFn: () => api<GuestState>(`/api/v1/public/cafe/guest?guest_token=${encodeURIComponent(token)}`),
    staleTime: 30_000,
  })
}

/** Orders placed from this browser (plus the same verified phone on other devices). */
export function useGuestOrders(enabled: boolean) {
  const token = typeof window === "undefined" ? "" : getGuestToken()
  return useQuery({
    queryKey: ["cafe-guest-orders", token],
    enabled: enabled && Boolean(token),
    queryFn: () =>
      api<GuestOrder[]>(`/api/v1/public/cafe/guest/orders?guest_token=${encodeURIComponent(token)}`),
    staleTime: 0,
  })
}

export function useSendOtp() {
  return useMutation({
    mutationFn: (phone: string) =>
      api<{ ok: boolean; code: string | null }>("/api/v1/public/cafe/guest/otp", {
        method: "POST",
        json: { guest_token: getGuestToken(), phone },
      }),
  })
}

export function useVerifyOtp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { phone: string; code: string }) =>
      api<GuestState & { ok: boolean; code?: string | null }>("/api/v1/public/cafe/guest/verify", {
        method: "POST",
        json: { guest_token: getGuestToken(), phone: input.phone, code: input.code },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cafe-guest-state"] })
      await queryClient.invalidateQueries({ queryKey: ["cafe-guest-orders"] })
    },
  })
}

/** «سفارش دوباره»: put an old order's lines back into the cart at today's prices. */
export function useReorder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderId: number) =>
      api<{ added: number; skipped: string[] }>(`/api/v1/public/cafe/guest/orders/${orderId}/reorder`, {
        method: "POST",
        json: { guest_token: getGuestToken() },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["guest-cart"] })
    },
  })
}

export type DeliveryQuote = {
  distance_km: number | null
  in_zone: boolean
  radius_km: number | null
  zone: { min_km: number; max_km: number; fee_minor: number; label_fa?: string | null; label_en?: string | null } | null
  fees: { packaging_minor: number; delivery_minor: number; service_minor: number; total_minor: number }
}

/** Zone + distance price for a map pin, before the guest commits to an address. */
export function useDeliveryQuote(input: { lat: number; lng: number; subtotal: number; items: number } | null) {
  return useQuery({
    queryKey: ["cafe-delivery-quote", input?.lat, input?.lng, input?.subtotal, input?.items],
    enabled: Boolean(input),
    queryFn: () =>
      api<DeliveryQuote>("/api/v1/public/cafe/quote", {
        method: "POST",
        json: {
          lat: input!.lat,
          lng: input!.lng,
          subtotal_minor: input!.subtotal,
          items: input!.items,
        },
      }),
    staleTime: 60_000,
  })
}

/** Kitchen status → the four steps a guest understands, shared by every skin. */
export const TRACKER_STEPS = ["new", "preparing", "ready", "done"] as const

export function trackerStep(kitchenStatus?: string | null, orderStatus?: string | null): number {
  if (orderStatus && ["cancelled", "failed", "refunded"].includes(orderStatus)) return -1
  switch (kitchenStatus) {
    case "preparing":
      return 1
    case "ready":
    case "out_for_delivery":
      return 2
    case "served":
    case "done":
      return 3
    default:
      return 0
  }
}
