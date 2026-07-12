"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"

export function DashboardPrefetch() {
  const queryClient = useQueryClient()

  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: ["modules"],
      queryFn: () =>
        api<{ data: unknown[] }>("/api/v1/modules").then((r) => r.data),
    })
    void queryClient.prefetchQuery({
      queryKey: ["auth-user"],
      queryFn: () => api("/api/v1/auth/user"),
    })
    void queryClient.prefetchQuery({
      queryKey: ["setup-status"],
      queryFn: () =>
        api<{ data: { setup_completed: boolean } }>("/api/v1/setup/status").then(
          (r) => r.data,
        ),
    })
  }, [queryClient])

  return null
}
