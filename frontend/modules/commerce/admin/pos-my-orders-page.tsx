"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { PageSkeleton } from "@/components/PageSkeleton"
import type { ResolvedAdminRoute } from "@/kernel/types"

/**
 * Fallback if this page file is resolved instead of orders via manifest.
 * Preferred path: commerce manifest maps pos/my-orders → orders page with mine+POS filters.
 */
export default function PosMyOrdersRedirectPage({ route: _route }: { route: ResolvedAdminRoute }) {
  const router = useRouter()

  useEffect(() => {
    router.replace("/dashboard/orders?source=pos&mine=1")
  }, [router])

  return <PageSkeleton />
}
