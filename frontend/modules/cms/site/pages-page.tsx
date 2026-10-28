import type { ResolvedSiteRoute } from "@/kernel/types"
import { fetchPublicItem } from "@/kernel/public-content"
import { getServerTranslations } from "@/lib/server-translations"
import { StorefrontDocument } from "@/builder/public-document"
import { AbSwitch } from "@/builder/render/ab-switch"
import { ThemeSlot } from "@/builder/theme/ThemeSlot"
import { isDocument } from "@/builder/tree"
import { SiteContentDetail } from "@/themes/shared/content/SiteContentDetail"
import { SiteEmptyState } from "@/themes/shared/content/SiteEmptyState"
import { activeThemeSlug } from "@/builder/public-document"
import { ClassicContactPage, ClassicFaqPage } from "@/themes/ecommerce-classic/components/ClassicInfoPages"
import { extractFaq, faqJsonLd, htmlToText, isImportedBuilderHtml, parseContactText } from "@/themes/ecommerce-classic/lib/faq-extract"

export const revalidate = 60

type CmsPage = {
  slug: string
  title: string
  body?: string | null
  builder_published?: unknown
  lang?: string | null
  ab?: { id: number; split: number; variant?: { document?: unknown } } | null
}

const FAQ_SLUGS = new Set(["faq", "faqs", "سوالات-متداول", "پرسش-های-متداول"])
const CONTACT_SLUGS = new Set(["contact", "contact-us", "تماس-با-ما", "ارتباط-با-ما"])

/** Collect raw HTML from imported (Elementor) builder documents so FAQ pairs can be parsed. */
function documentHtml(doc: unknown): string {
  const out: string[] = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return
    if (Array.isArray(node)) return node.forEach(walk)
    const rec = node as Record<string, unknown>
    const props = rec.props as Record<string, unknown> | undefined
    if (props) for (const k of ["html", "content", "text", "items"]) if (typeof props[k] === "string") out.push(props[k] as string)
    for (const v of Object.values(rec)) if (v && typeof v === "object") walk(v)
  }
  walk(doc)
  return out.join("\n")
}

/** A builder document the merchant authored here (not a WordPress/Elementor import). */
function hasOwnDocument(doc: unknown): boolean {
  if (!isDocument(doc) || !doc.sections.length || (doc as { source?: string }).source === "elementor") return false
  // A seeded text-only page (heading + plain text) is not a designed layout: the native template presents it better.
  const types: string[] = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return
    if (Array.isArray(node)) return node.forEach(walk)
    const rec = node as Record<string, unknown>
    if (typeof rec.type === "string" && rec.props) types.push(rec.type)
    for (const v of Object.values(rec)) if (v && typeof v === "object") walk(v)
  }
  walk(doc)
  return types.some((t) => !PLAIN_WIDGETS.has(t))
}

const PLAIN_WIDGETS = new Set(["heading", "text", "spacer", "divider", "paragraph", "rich-text", "richtext"])

export default async function Page({ route }: { route: ResolvedSiteRoute }) {
  const t = await getServerTranslations("site")
  const slug = route.params?.slug
  if (!slug) {
    return (
      <SiteEmptyState
        title={t("pages_missing")}
        description={t("empty_default")}
        actionHref="/"
        actionLabel={t("back_home")}
      />
    )
  }

  const page = await fetchPublicItem<CmsPage>(`/api/v1/public/pages/${encodeURIComponent(slug)}`)
  // No contact page yet: every theme (shop, poet/magazine, blog…) gets the native contact template, never a soft 404.
  if (!page && CONTACT_SLUGS.has(decodeURIComponent(slug).toLowerCase())) {
    return <ClassicContactPage title="تماس با ما" fallback={{ phones: [], emails: [] }} />
  }
  if (!page) {
    return (
      <SiteEmptyState
        title={t("pages_missing")}
        description={t("empty_default")}
        actionHref="/"
        actionLabel={t("back_home")}
      />
    )
  }

  // Native FAQ / contact templates for the classic storefront (imported WP pages render as empty shells).
  const rawSlug = decodeURIComponent(slug).toLowerCase()
  const nativeKind = FAQ_SLUGS.has(rawSlug) ? "faq" : CONTACT_SLUGS.has(rawSlug) ? "contact" : null
  if (nativeKind && !hasOwnDocument(page.builder_published)) {
    const theme = await activeThemeSlug()
    if (theme === "ecommerce-classic" || theme === "ecommerce-default") {
      const source = [page.body ?? "", documentHtml(page.builder_published)].join("\n")
      if (nativeKind === "faq") {
        const items = extractFaq(page.body).length ? extractFaq(page.body) : extractFaq(documentHtml(page.builder_published))
        return (
          <>
            {items.length ? (
              <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(items)).replace(/</g, "\\u003c") }}
              />
            ) : null}
            <ClassicFaqPage title={page.title || "سوالات متداول"} items={items} />
          </>
        )
      }
      const text = isImportedBuilderHtml(source) ? htmlToText(source) : htmlToText(source.trim() || page.body || "")
      return <ClassicContactPage title={page.title || "تماس با ما"} fallback={parseContactText(text)} />
    }
  }

  if (isDocument(page.builder_published) && page.builder_published.sections.length) {
    const original = <StorefrontDocument document={page.builder_published} runtime={{ siteName: page.title, lang: page.lang }} />
    const variant = page.ab?.variant?.document
    if (page.ab && isDocument(variant)) {
      return <AbSwitch testId={page.ab.id} split={page.ab.split} a={original} b={<StorefrontDocument document={variant} runtime={{ siteName: page.title, lang: page.lang }} />} />
    }
    return original
  }

  return (
    <ThemeSlot
      kind="single_page"
      tokens={{ title: page.title, body: page.body, excerpt: page.title }}
      runtime={{ siteName: page.title }}
    >
      <SiteContentDetail
        title={page.title}
        body={page.body}
        backHref="/"
        backLabel={t("back_home")}
      />
    </ThemeSlot>
  )
}
