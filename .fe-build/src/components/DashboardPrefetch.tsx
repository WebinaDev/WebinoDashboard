"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { STORE_CURRENCY_QUERY_KEY } from "@/lib/store-currency"

/** Warms caches that pages read on first paint; keys and fetchers must match their consumers. */
export function DashboardPrefetch() {
  const queryClient = useQueryClient()

  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: STORE_CURRENCY_QUERY_KEY,
      queryFn: () => api("/api/v1/tenant"),
      staleTime: 10 * 60 * 1000,
      retry: false,
    })
  }, [queryClient])

  return null
}
