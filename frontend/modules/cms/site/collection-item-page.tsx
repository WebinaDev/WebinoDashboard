import Link from "next/link"
import { notFound } from "next/navigation"

import { sanitizeBuilderHtml } from "@/builder/render/sanitize-html"
import { ThemeSlot } from "@/builder/theme/ThemeSlot"
import type { ResolvedSiteRoute } from "@/kernel/types"
import { apiServer } from "@/lib/api-server"
import { getServerTranslations } from "@/lib/server-translations"

export const revalidate = 60

export type CollectionItemSeo = { title: string; description: string; image: string | null; noindex: boolean; schema_type: string }

export type CollectionItemPayload = {
  collection: { slug: string; name: string; fields: { key: string; label: string; type: string }[] }
  item: { slug: string; title: string; data: Record<string, string>; refs?: Record<string, { slug: string; title: string; url?: string }[]> }
  seo?: CollectionItemSeo
}

/** schema.org JSON-LD for a collection item; `<` is escaped so the payload cannot close the script tag. */
export function collectionItemJsonLd(payload: CollectionItemPayload, origin = ""): string {
  const seo = payload.seo
  const url = `${origin}/c/${encodeURIComponent(payload.collection.slug)}/${encodeURIComponent(payload.item.slug)}`
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": seo?.schema_type || "Thing",
    name: seo?.title || payload.item.title,
    url,
  }
  if (seo?.description) data.description = seo.description
  if (seo?.image) data.image = seo.image
  return JSON.stringify(data).replace(/</g, "\\u003c")
}

export async function loadCollectionItem(collection: string, item: string): Promise<CollectionItemPayload | null> {
  const res = await apiServer<{ data?: CollectionItemPayload }>(
    `/api/v1/public/builder/collections/${encodeURIComponent(collection)}/items/${encodeURIComponent(item)}`,
    { revalidate: 60 },
  ).catch(() => null)
  return res?.data?.item ? res.data : null
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c)
}

function safeUrl(value: string): string | null {
  return /^(https:\/\/|\/(?!\/))[^\s"<>]*$/.test(value) ? value : null
}

/** Single CMS collection item: /c/<collection>/<item>. Rich text is sanitised; other fields are escaped. */
export default async function CollectionItemPage({ route }: { route: ResolvedSiteRoute }) {
  const t = await getServerTranslations("site")
  const payload = await loadCollectionItem(route.params?.collection ?? "", route.params?.item ?? "")
  if (!payload) notFound()
  const { collection, item } = payload
  const jsonLd = payload.seo?.noindex ? null : collectionItemJsonLd(payload)
  const parts: string[] = []
  for (const field of collection.fields) {
    const value = item.data?.[field.key]
    if (!value) continue
    if (field.type === "image") {
      const src = safeUrl(value)
      if (src) parts.push(`<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(item.title)}" loading="lazy" /></figure>`)
    } else if (field.type === "richtext") {
      parts.push(sanitizeBuilderHtml(value))
    } else if (field.type === "url") {
      const href = safeUrl(value)
      if (href) parts.push(`<p><strong>${escapeHtml(field.label)}:</strong> <a href="${escapeHtml(href)}" rel="noopener">${escapeHtml(href)}</a></p>`)
    } else if (field.type === "textarea") {
      parts.push(`<p>${escapeHtml(value).replace(/\n/g, "<br />")}</p>`)
    } else {
      parts.push(`<p><strong>${escapeHtml(field.label)}:</strong> ${escapeHtml(value)}</p>`)
    }
  }
  return (
    <>
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} /> : null}
      <ThemeSlot
        kind="collection_item"
        context={{ singular: "collection_item", category: collection.slug, slug: item.slug }}
        tokens={{ title: item.title, excerpt: payload.seo?.description ?? "" }}
        runtime={{ siteName: collection.name, collectionItem: { ...item, collection: { slug: collection.slug, name: collection.name } } }}
      >
        <article className="container mx-auto max-w-3xl px-4 py-12">
          <nav aria-label={t("breadcrumb")} className="mb-4 text-xs text-foreground/60">
            <Link href="/">{t("back_home")}</Link> / <span>{collection.name}</span>
          </nav>
          <h1 className="text-3xl font-semibold tracking-tight">{item.title}</h1>
          <div className="prose prose-neutral mt-6 max-w-none [&_img]:rounded-2xl" dangerouslySetInnerHTML={{ __html: parts.join("") }} />
        </article>
      </ThemeSlot>
    </>
  )
}
