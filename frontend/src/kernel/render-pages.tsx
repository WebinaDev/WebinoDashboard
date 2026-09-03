import { notFound } from "next/navigation"
import { Suspense } from "react"

import { AdminPageSkeleton } from "@/kernel/components/AdminPageSkeleton"
import { SitePageSkeleton } from "@/kernel/components/SitePageSkeleton"
import { loadAdminPage, loadSitePage } from "@/kernel/theme-loader"
import { resolveAdminRoute, resolveSiteRoute } from "@/kernel/route-resolver"
import { getPublicActivations, getTenantActivations } from "@/kernel/server-data"

const RESERVED_SITE_SEGMENTS = new Set(["admin", "login", "setup"])

export async function renderAdminPage(segments: string[]) {
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

export async function renderSitePage(
  segments: string[],
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  if (segments.length > 0 && RESERVED_SITE_SEGMENTS.has(segments[0])) {
    notFound()
  }

  const activations = await getPublicActivations()
  const route = resolveSiteRoute(segments, activations)

  if (!route) {
    notFound()
  }

  const Page = await loadSitePage(route)

  const normalized: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(searchParams)) {
    normalized[key] = Array.isArray(value) ? value[0] : value
  }

  return (
    <Suspense fallback={<SitePageSkeleton />}>
      <Page route={route} searchParams={normalized} />
    </Suspense>
  )
}
