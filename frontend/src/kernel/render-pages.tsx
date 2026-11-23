import { notFound } from "next/navigation"
import { Suspense } from "react"

import { PermissionGate } from "@/components/PermissionGate"
import { AdminPageSkeleton } from "@/kernel/components/AdminPageSkeleton"
import { SitePageSkeleton } from "@/kernel/components/SitePageSkeleton"
import { isPortalPath } from "@/kernel/portal"
import { loadAdminPage, loadSitePage } from "@/kernel/theme-loader"
import { resolveAdminRoute, resolveHomeRoute, resolveSiteRoute } from "@/kernel/route-resolver"
import { getPublicActivations } from "@/kernel/server-data"
import { fetchPublicItem } from "@/kernel/public-content"
import type { ResolvedSiteRoute } from "@/kernel/types"

const RESERVED_SITE_SEGMENTS = new Set(["admin", "dashboard", "login", "setup"])

/**
 * Slugs the CMS renders with a native template even without a stored page
 * (contact form, FAQ sheet). They must not be gated as missing.
 */
const NATIVE_FALLBACK_SLUGS = new Set([
  "contact", "contact-us", "تماس-با-ما", "ارتباط-با-ما",
  "faq", "faqs", "سوالات-متداول", "پرسش-های-متداول",
])

/**
 * A missing CMS page or blog post used to render its "not found" shell with a 200
 * status, because the check ran inside the Suspense boundary after the response had
 * already started streaming. Gate here so crawlers get a real 404.
 */
async function assertContentExists(route: ResolvedSiteRoute): Promise<void> {
  const slug = route.params?.slug
  if (!slug) return
  if (route.moduleSlug === "cms" && !route.page) {
    if (NATIVE_FALLBACK_SLUGS.has(slug.toLowerCase())) return
    const page = await fetchPublicItem(`/api/v1/public/pages/${encodeURIComponent(slug)}`)
    if (!page) notFound()
    return
  }
  if (route.moduleSlug === "blog") {
    const post = await fetchPublicItem(`/api/v1/public/blog/${encodeURIComponent(slug)}`)
    if (!post) notFound()
  }
}

export async function renderAdminPage(segments: string[]) {
  // `/dashboard` may be claimed by a module (`homeFor`). Only the root consults
  // activations, and only for that lookup — the route resolver itself stays pure so an
  // empty activations payload can never 404 a dashboard page.
  const route =
    segments.length === 0
      ? (resolveHomeRoute(await getPublicActivations()) ?? resolveAdminRoute(segments))
      : resolveAdminRoute(segments)

  if (!route) {
    notFound()
  }

  const Page = await loadAdminPage(route)
  const page = (
    <Suspense fallback={<AdminPageSkeleton />}>
      <Page route={route} />
    </Suspense>
  )

  return isPortalPath(route.path) ? (
    <PermissionGate roles={["customer", "partner", "subscriber"]} anyCapabilities={["account.portal", "partner.portal"]}>
      {page}
    </PermissionGate>
  ) : (
    <PermissionGate capability={route.capability}>{page}</PermissionGate>
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

  await assertContentExists(route)

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
