import { notFound } from "next/navigation"
import { Suspense } from "react"

import { loadAdminPage } from "@/kernel/theme-loader"
import { resolveAdminRoute } from "@/kernel/route-resolver"
import { getTenantActivations } from "@/kernel/server-data"
import { AdminPageSkeleton } from "@/kernel/components/AdminPageSkeleton"

export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{ slug?: string[] }>
}

export default async function AdminCatchAllPage({ params }: Props) {
  const segments = (await params).slug ?? []
  const activations = await getTenantActivations()
  const route = resolveAdminRoute(segments, activations)

  if (!route) {
    notFound()
  }

  const Page = await loadAdminPage(route)

  return (
    <Suspense fallback={<AdminPageSkeleton />}>
      <Page route={route} />
    </Suspense>
  )
}
