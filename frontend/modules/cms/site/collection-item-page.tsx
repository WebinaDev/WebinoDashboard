import Link from "next/link"
import { notFound } from "next/navigation"

import { sanitizeBuilderHtml } from "@/builder/render/sanitize-html"
import type { ResolvedSiteRoute } from "@/kernel/types"
import { apiServer } from "@/lib/api-server"
import { getServerTranslations } from "@/lib/server-translations"

export const revalidate = 60

export type CollectionItemPayload = {
  collection: { slug: string; name: string; fields: { key: string; label: string; type: string }[] }
  item: { slug: string; title: string; data: Record<string, string> }
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
    <article className="container mx-auto max-w-3xl px-4 py-12">
      <nav aria-label={t("breadcrumb")} className="mb-4 text-xs text-foreground/60">
        <Link href="/">{t("back_home")}</Link> / <span>{collection.name}</span>
      </nav>
      <h1 className="text-3xl font-semibold tracking-tight">{item.title}</h1>
      <div className="prose prose-neutral mt-6 max-w-none [&_img]:rounded-2xl" dangerouslySetInnerHTML={{ __html: parts.join("") }} />
    </article>
  )
}
