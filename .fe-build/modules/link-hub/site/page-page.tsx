import type { ResolvedSiteRoute } from "@/kernel/types"
import { apiServer } from "@/lib/api-server"

import type { PublicPage } from "../lib/LinkHubView"
import LinkHubPublicPage from "./page-page-client"

type PagePayload = PublicPage & { seo?: { title?: string; description?: string | null; image?: string | null } }

export async function loadLinkHubPage(slug?: string): Promise<PagePayload | null> {
  try {
    const qs = slug ? `?slug=${encodeURIComponent(slug)}` : ""
    const res = await apiServer<{ data?: PagePayload }>(`/api/v1/public/link-hub/page${qs}`, { revalidate: 30 })
    return res?.data ?? null
  } catch {
    return null
  }
}

/** Server-rendered first paint (SEO, no loading flash) plus schema.org markup. */
export default async function Page({
  route,
}: {
  route: ResolvedSiteRoute
  searchParams?: Record<string, string | undefined>
}) {
  const slug = route.params?.slug
  const initial = await loadLinkHubPage(slug)
  const jsonLd = initial ? buildJsonLd(initial) : null
  return (
    <>
      {jsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      ) : null}
      <LinkHubPublicPage slug={slug} initial={initial} />
    </>
  )
}

function buildJsonLd(page: PagePayload): Record<string, unknown> {
  const sameAs: string[] = []
  let telephone: string | undefined
  let address: string | undefined
  let geo: { lat: number; lng: number } | undefined
  for (const block of page.blocks) {
    const p = block.payload
    if (block.type === "contact") {
      if (p.phone) telephone = String(p.phone)
      for (const s of Array.isArray(p.socials) ? (p.socials as Array<{ url?: string }>) : []) {
        if (s.url && /^https?:/.test(s.url)) sameAs.push(s.url)
      }
    }
    if (block.type === "map") {
      geo = { lat: Number(p.lat), lng: Number(p.lng) }
      if (p.address) address = String(p.address)
    }
  }
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: page.profile.title,
    ...(page.seo?.description ? { description: page.seo.description } : {}),
    ...(page.profile.avatar_url ? { logo: page.profile.avatar_url, image: page.profile.avatar_url } : {}),
    ...(telephone ? { telephone } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(address || geo
      ? {
          location: {
            "@type": "Place",
            ...(address ? { address } : {}),
            ...(geo ? { geo: { "@type": "GeoCoordinates", latitude: geo.lat, longitude: geo.lng } } : {}),
          },
        }
      : {}),
  }
}
