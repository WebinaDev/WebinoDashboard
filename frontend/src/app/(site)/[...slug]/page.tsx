import type { Metadata } from "next"

import { renderSitePage } from "@/kernel/render-pages"
import { loadLinkHubPage } from "../../../../modules/link-hub/site/page-page"

export const revalidate = 60

type Props = {
  params: Promise<{ slug: string[] }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

/** Per-route metadata. Only the link hub needs it today; other routes keep the layout defaults. */
export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const segments = (await params).slug ?? []
  if (segments[0] !== "link-hub" || segments.length > 2) return {}
  const page = await loadLinkHubPage(segments[1])
  if (!page) return {}
  const title = page.seo?.title || page.profile.title
  const description = page.seo?.description || undefined
  const image = page.seo?.image || undefined
  return {
    title,
    description,
    openGraph: { title, description, type: "profile", images: image ? [image] : undefined },
    twitter: { card: "summary", title, description, images: image ? [image] : undefined },
  }
}

export default async function SiteCatchAllPage({ params, searchParams }: Props) {
  const segments = (await params).slug ?? []
  const sp = searchParams ? await searchParams : {}
  return renderSitePage(segments, sp)
}
