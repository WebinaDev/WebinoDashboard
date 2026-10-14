import type { Metadata } from "next"

import { JsonLd } from "@/components/seo/JsonLd"
import { renderSitePage } from "@/kernel/render-pages"
import { apiServer } from "@/lib/api-server"
import { loadLinkHubPage } from "../../../../modules/link-hub/site/page-page"

export const revalidate = 60

type Props = {
  params: Promise<{ slug: string[] }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

type ProductSeoPayload = {
  data?: {
    meta?: {
      alternates?: { lang: string; url: string }[]
      breadcrumb?: boolean
      title?: string
      description?: string
      canonical?: string
      robots?: string
      og?: { title?: string; description?: string; image?: string; url?: string; site_name?: string }
    }
    json_ld?: Record<string, unknown>
  }
}

/** Product SEO (meta + schema.org Product/BreadcrumbList graph) built by the backend SeoMetaBuilder. */
async function loadProductSeo(slug: string, type: "product" | "page" = "product"): Promise<ProductSeoPayload["data"] | null> {
  try {
    const path = type === "product" ? `/product/${slug}` : `/pages/${slug}`
    const res = await apiServer<ProductSeoPayload>(
      `/api/v1/public/seo/meta?type=${type}&slug=${encodeURIComponent(slug)}&path=${encodeURIComponent(path)}`,
      { revalidate: 60, tags: ["seo"] },
    )
    return res?.data ?? null
  } catch {
    return null
  }
}

/** Per-route metadata: link hub and product pages; other routes keep the layout defaults. */
export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const segments = (await params).slug ?? []
  if (segments[0] === "product" && segments[1] && segments.length === 2) {
    const seo = await loadProductSeo(decodeURIComponent(segments[1]))
    const meta = seo?.meta
    if (!meta) return {}
    return {
      title: meta.title || undefined,
      description: meta.description || undefined,
      robots: meta.robots || undefined,
      alternates: meta.canonical ? { canonical: meta.canonical } : undefined,
      openGraph: meta.og
        ? {
            title: meta.og.title,
            description: meta.og.description,
            images: meta.og.image ? [meta.og.image] : undefined,
            url: meta.og.url,
            siteName: meta.og.site_name,
          }
        : undefined,
    }
  }
  if (segments[0] === "preview") return { robots: { index: false, follow: false } }
  if (segments[0] === "pages" && segments[1] && segments.length === 2) {
    const meta = (await loadProductSeo(decodeURIComponent(segments[1]), "page"))?.meta
    if (!meta) return {}
    const languages = Object.fromEntries((meta.alternates ?? []).map((alt) => [alt.lang, alt.url]))
    return {
      title: meta.title || undefined,
      description: meta.description || undefined,
      robots: meta.robots || undefined,
      alternates: { canonical: meta.canonical || undefined, languages: Object.keys(languages).length ? languages : undefined },
      openGraph: meta.og ? { title: meta.og.title, description: meta.og.description, images: meta.og.image ? [meta.og.image] : undefined, url: meta.og.url, siteName: meta.og.site_name } : undefined,
    }
  }
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
  if (segments[0] === "product" && segments[1] && segments.length === 2) {
    const [seo, page] = await Promise.all([loadProductSeo(decodeURIComponent(segments[1])), renderSitePage(segments, sp)])
    return (
      <>
        <JsonLd data={seo?.json_ld ?? null} />
        {page}
      </>
    )
  }
  if (segments[0] === "pages" && segments[1] && segments.length === 2) {
    const slug = decodeURIComponent(segments[1])
    const [seo, page] = await Promise.all([loadProductSeo(slug, "page"), renderSitePage(segments, sp)])
    const meta = seo?.meta
    const origin = meta?.canonical ? meta.canonical.replace(/^(https?:\/\/[^/]+).*$/, "$1") : ""
    const crumbs = meta && meta.breadcrumb !== false && origin
      ? {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: meta.og?.site_name || "خانه", item: `${origin}/` },
            { "@type": "ListItem", position: 2, name: meta.og?.title || slug, item: meta.canonical },
          ],
        }
      : null
    return (
      <>
        <JsonLd data={seo?.json_ld ?? null} />
        {crumbs ? <JsonLd data={crumbs} /> : null}
        {page}
      </>
    )
  }
  return renderSitePage(segments, sp)
}
