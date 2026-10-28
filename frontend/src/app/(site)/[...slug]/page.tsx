import type { Metadata } from "next"

import { loadCatalogSeed } from "@/builder/storefront/catalog-seed"
import { CatalogSeedProvider } from "@/builder/storefront/use-catalog"
import { JsonLd } from "@/components/seo/JsonLd"
import { renderSitePage } from "@/kernel/render-pages"
import { apiServer } from "@/lib/api-server"
import { canonicalSiteSegments } from "@/kernel/route-resolver"
import { resolveStoreSegments } from "@/kernel/store-slug"
import { loadCollectionItem } from "../../../../modules/cms/site/collection-item-page"
import { loadLinkHubPage } from "../../../../modules/link-hub/site/page-page"
import { poemCanonicalPath, poemDescription, poemJsonLd, poemTitle, type PoemSeoSource } from "@/lib/poem-seo"

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

type TaxonomyType = "category" | "brand" | "tag"
const TAXONOMY_ROUTE: Record<string, TaxonomyType> = { "product-category": "category", brand: "brand", "product-tag": "tag" }

/** Labels for generic store routes so every page gets its own <title> (not only the site name). */
const ROUTE_TITLES: Record<string, string> = {
  shop: "فروشگاه",
  cart: "سبد خرید",
  checkout: "تسویه حساب",
  account: "حساب کاربری",
  compare: "مقایسه محصولات",
  "amazing-offers": "شگفت‌انگیزها",
  "order-tracking": "پیگیری سفارش",
  wishlist: "علاقه‌مندی‌ها",
  blog: "مجله",
  search: "جستجو",
}

async function loadSeo(query: string): Promise<ProductSeoPayload["data"] | null> {
  try {
    const res = await apiServer<ProductSeoPayload>(`/api/v1/public/seo/meta?${query}`, { revalidate: 60, tags: ["seo"] })
    return res?.data ?? null
  } catch {
    return null
  }
}

const taxonomySeo = (type: TaxonomyType, slug: string, path: string) =>
  loadSeo(`type=${type}&slug=${encodeURIComponent(slug)}&path=${encodeURIComponent(path)}`)

function metaToMetadata(meta: NonNullable<ProductSeoPayload["data"]>["meta"]): Metadata {
  if (!meta) return {}
  return {
    title: meta.title ? { absolute: meta.title } : undefined,
    description: meta.description || undefined,
    robots: meta.robots || undefined,
    alternates: meta.canonical ? { canonical: meta.canonical } : undefined,
    openGraph: meta.og
      ? { title: meta.og.title, description: meta.og.description, images: meta.og.image ? [meta.og.image] : undefined, url: meta.og.url, siteName: meta.og.site_name }
      : undefined,
  }
}

async function storeSegments(raw: string[]): Promise<string[]> {
  return (await resolveStoreSegments(raw, canonicalSiteSegments(raw))).segments
}

/** Single poem shown by a builder page's poem-single widget via `?poem=<slug>`. */
async function loadPoem(slug: string): Promise<PoemSeoSource | null> {
  if (!slug) return null
  const res = await apiServer<{ data?: PoemSeoSource }>(`/api/v1/public/poetry/poems/${encodeURIComponent(slug)}`, { revalidate: 60, tags: ["poetry"] })
  return res?.data?.slug ? res.data : null
}

function poemParam(sp: Record<string, string | string[] | undefined>): string {
  const v = sp.poem
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? ""
}

const originOf = (canonical?: string) => (canonical ? canonical.replace(/^(https?:\/\/[^/]+).*$/, "$1") : "")

/** Per-route metadata: link hub and product pages; other routes keep the layout defaults. */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const raw = (await params).slug ?? []
  const segments = await storeSegments(raw)
  const taxonomy = TAXONOMY_ROUTE[segments[0]]
  if (taxonomy && segments[1] && segments.length === 2) {
    const slug = decodeURIComponent(segments[1])
    return metaToMetadata((await taxonomySeo(taxonomy, slug, `/${raw.join("/")}`))?.meta)
  }
  if (isSearchPath(segments)) {
    const sp = searchParams ? await searchParams : {}
    const qv = sp.q ?? sp.s
    const q = (Array.isArray(qv) ? qv[0] : qv)?.trim().slice(0, 80) ?? ""
    const label = q ? `جستجو برای «${q}»` : ROUTE_TITLES.search
    const seo = await loadSeo(`path=${encodeURIComponent("/search")}&fallback_title=${encodeURIComponent(label)}`)
    const md = metaToMetadata(seo?.meta)
    // Result pages are thin/duplicate content: keep them out of the index but follow product links.
    return { ...md, title: md.title ?? label, robots: { index: false, follow: true } }
  }
  if (segments.length === 1 && ROUTE_TITLES[segments[0]]) {
    const seo = await loadSeo(`path=${encodeURIComponent(`/${segments[0]}`)}&fallback_title=${encodeURIComponent(ROUTE_TITLES[segments[0]])}`)
    return metaToMetadata(seo?.meta)
  }
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
  if (segments[0] === "c" && segments.length === 3) {
    const payload = await loadCollectionItem(decodeURIComponent(segments[1]), decodeURIComponent(segments[2]))
    if (!payload) return {}
    const seo = payload.seo
    const fields = payload.collection.fields
    const textKey = fields.find((f) => f.type === "textarea" || f.type === "text")?.key
    const imageKey = fields.find((f) => f.type === "image")?.key
    const description = seo?.description?.slice(0, 160) || (textKey ? (payload.item.data[textKey] ?? "").slice(0, 160) || undefined : undefined)
    const image = seo?.image || (imageKey ? payload.item.data[imageKey] : undefined)
    const title = seo?.title || `${payload.item.title} | ${payload.collection.name}`
    return {
      title,
      description,
      robots: seo?.noindex ? { index: false, follow: true } : undefined,
      alternates: { canonical: `/c/${segments[1]}/${segments[2]}` },
      openGraph: { title, description, images: image ? [image] : undefined },
    }
  }
  if (segments[0] === "pages" && segments[1] && segments.length === 2) {
    const pageSlug = decodeURIComponent(segments[1])
    const sp = searchParams ? await searchParams : {}
    const [seo, poem] = await Promise.all([loadProductSeo(pageSlug, "page"), loadPoem(poemParam(sp))])
    const meta = seo?.meta
    if (poem) {
      const site = meta?.og?.site_name || ""
      const title = poemTitle(poem, site)
      const description = poemDescription(poem) || meta?.description || undefined
      const path = poemCanonicalPath(pageSlug, poem.slug)
      const url = `${originOf(meta?.canonical)}${path}`
      return {
        title: { absolute: title },
        description,
        robots: meta?.robots || undefined,
        alternates: { canonical: url },
        openGraph: { type: "article", title, description, url, siteName: site || undefined, images: meta?.og?.image ? [meta.og.image] : undefined },
        twitter: { card: "summary", title, description },
      }
    }
    // Unknown page (soft 404 body): give it a real title and keep it out of the index instead of the bare site name.
    if (!meta) return { title: "صفحه پیدا نشد", robots: { index: false, follow: true } }
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
  const raw = (await params).slug ?? []
  const segments = await storeSegments(raw)
  const sp = searchParams ? await searchParams : {}
  const taxonomy = TAXONOMY_ROUTE[segments[0]]
  if (taxonomy && segments[1] && segments.length === 2) {
    const slug = decodeURIComponent(segments[1])
    const [seo, page] = await Promise.all([taxonomySeo(taxonomy, slug, `/${raw.join("/")}`), renderSitePage(segments, sp)])
    return (
      <>
        <JsonLd data={seo?.json_ld ?? null} />
        {page}
      </>
    )
  }
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
    const [seo, page, poem] = await Promise.all([loadProductSeo(slug, "page"), renderSitePage(segments, sp), loadPoem(poemParam(sp))])
    const meta = seo?.meta
    const origin = originOf(meta?.canonical)
    if (poem) {
      return (
        <>
          <JsonLd data={poemJsonLd(poem, `${origin}${poemCanonicalPath(slug, poem.slug)}`, meta?.og?.site_name)} />
          {page}
        </>
      )
    }
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
  if (isSearchPath(segments)) {
    // SSR the search results grid (links + images) instead of an empty client-only shell.
    const flat: Record<string, string | undefined> = {}
    for (const [k, v] of Object.entries(sp)) flat[k] = Array.isArray(v) ? v[0] : v
    const [seed, page] = await Promise.all([loadCatalogSeed(flat, {}), renderSitePage(segments, sp)])
    return <CatalogSeedProvider seed={seed}>{page}</CatalogSeedProvider>
  }
  return renderSitePage(segments, sp)
}

function isSearchPath(segments: string[]): boolean {
  return (segments.length === 1 && segments[0] === "search") || (segments.length === 2 && segments[0] === "pages" && segments[1] === "search")
}
