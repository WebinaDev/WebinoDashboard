import { notFound } from "next/navigation"
import { Suspense } from "react"

import { loadSitePage } from "@/kernel/theme-loader"
import { resolveSiteRoute } from "@/kernel/route-resolver"
import { getPublicActivations } from "@/kernel/server-data"
import { SitePageSkeleton } from "@/kernel/components/SitePageSkeleton"

export const revalidate = 60

type Props = {
  params: Promise<{ slug?: string[] }>
}

export default async function SiteCatchAllPage({ params }: Props) {
  const segments = (await params).slug ?? []
  const activations = await getPublicActivations()
  const route = resolveSiteRoute(segments, activations)

  if (!route) {
    notFound()
  }

  const Page = await loadSitePage(route)

  return (
    <Suspense fallback={<SitePageSkeleton />}>
      <Page route={route} />
    </Suspense>
  )
}
