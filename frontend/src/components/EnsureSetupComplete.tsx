"use client"

import type { ReactNode } from "react"
import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"

type SetupStatus = {
  setup_completed: boolean
}

export function EnsureSetupComplete({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ""
  const router = useRouter()

  const { data: status, isLoading } = useQuery({
    queryKey: ["setup-status"],
    queryFn: () =>
      api<{ data: SetupStatus }>("/api/v1/setup/status").then((r) => r.data),
    retry: false,
  })

  const setupCompleted = status?.setup_completed ?? true

  useEffect(() => {
    if (!isLoading && !setupCompleted && pathname !== "/setup") {
      router.replace("/setup")
    }
  }, [isLoading, setupCompleted, pathname, router])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full max-w-xl" />
      </div>
    )
  }

  if (!setupCompleted && pathname !== "/setup") {
    return (
      <div className="flex flex-col gap-2 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full max-w-xl" />
      </div>
    )
  }

  return children
}
