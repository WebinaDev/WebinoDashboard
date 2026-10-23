import { cache, Suspense, type ReactNode } from "react"

import { apiServer } from "@/lib/api-server"
import { asGlobals, type BuilderGlobals } from "./globals"
import { DocumentView } from "./render/DocumentView"
import { themeQueryString, type ThemeQuery } from "./theme/context"
import { requestThemeContext } from "./theme/request"
import { isDocument } from "./tree"
import type { BuilderDocument, RuntimeContext, SectionNode } from "./types"
import { storefrontThemeClass } from "@/themes/shared/storefront-skin"

const PUBLIC_DOC_REVALIDATE = 10

/** Drop hidden nodes and editor-only metadata so they are not serialized into the RSC payload of public pages. */
function pruneForView(doc: BuilderDocument): BuilderDocument {
  const strip = <T extends { hidden?: boolean; label?: string; locked?: boolean }>(n: T): T => {
    const { label: _l, locked: _k, ...rest } = n
    void _l; void _k
    return rest as T
  }
  const sections = (list: SectionNode[]): SectionNode[] =>
    list.filter((s) => !s.hidden).map((s) => ({
      ...strip(s),
      columns: s.columns.filter((c) => !c.hidden).map((c) => ({
        ...strip(c),
        widgets: c.widgets.filter((w) => !w.hidden).map((w) => ({ ...strip(w), ...(w.children ? { children: sections(w.children) } : {}) })),
      })),
    }))
  const { source: _src, ...rest } = doc
  void _src
  return { ...rest, sections: sections(doc.sections ?? []) }
}

async function readDocument(path: string): Promise<BuilderDocument | null> {
  // Short data-cache window (was 0 = uncached on every request). Publishes show within ~10s.
  const res = await apiServer<{ data?: { document?: unknown } }>(path, { revalidate: PUBLIC_DOC_REVALIDATE, tags: ["builder"] })
  const document = res?.data?.document
  return isDocument(document) ? pruneForView(document) : null
}

export function loadPublishedPage(slug: string): Promise<BuilderDocument | null> {
  return readDocument(`/api/v1/public/builder/pages/${encodeURIComponent(slug)}`)
}

export function loadPublishedTemplate(kind: "header" | "footer"): Promise<BuilderDocument | null> {
  return loadResolvedTemplate(kind, { path: "/" })
}

export const loadPublishedGlobals = cache(async (): Promise<BuilderGlobals | null> => {
  const res = await apiServer<{ data?: { settings?: unknown } }>("/api/v1/public/builder/globals", { revalidate: PUBLIC_DOC_REVALIDATE, tags: ["builder"] })
  return res?.data?.settings ? asGlobals(res.data.settings) : null
})

export const loadResolvedTemplate = cache(async (kind: string, query: ThemeQuery): Promise<BuilderDocument | null> => {
  return readDocument(`/api/v1/public/builder/resolve?${themeQueryString(kind, query)}`)
})

export async function activeThemeSlug(): Promise<string | null> {
  const res = await apiServer<{ data?: { active_theme_slug?: string | null } }>("/api/v1/public/tenant", {
    revalidate: 30,
    tags: ["tenant"],
  })
  return res?.data?.active_theme_slug ?? null
}

export function PublishedDocument({
  document,
  runtime,
  globals,
  themeClass,
}: {
  document: BuilderDocument
  runtime?: RuntimeContext
  globals?: BuilderGlobals | null
  themeClass?: string
}) {
  return (
    <Suspense fallback={null}>
      <DocumentView document={document} mode="view" device="desktop" runtime={runtime} globals={globals ?? undefined} themeClass={themeClass ?? (storefrontThemeClass(runtime?.themeSlug) || "sf-classic")} />
    </Suspense>
  )
}

export async function StorefrontDocument({
  document,
  runtime,
  context,
  themeClass,
}: {
  document: BuilderDocument
  runtime?: RuntimeContext
  context?: ThemeQuery
  themeClass?: string
}) {
  // Parallel instead of four sequential round-trips.
  const [globals, query] = await Promise.all([loadPublishedGlobals(), context ?? requestThemeContext()])
  const [loop, themeSlug] = await Promise.all([
    runtime?.loopDocument ?? loadResolvedTemplate("loop_item", query),
    runtime?.themeSlug ?? activeThemeSlug(),
  ])
  return (
    <PublishedDocument
      document={document}
      globals={globals}
      themeClass={themeClass}
      runtime={{ ...runtime, themeSlug, loopDocument: loop ?? undefined }}
    />
  )
}

export async function resolveStorefrontDocument(
  slug: string,
  themeFallback: BuilderDocument | null,
): Promise<BuilderDocument | null> {
  const published = await loadPublishedPage(slug)
  if (published) return published
  if (!themeFallback) return null
  const theme = await activeThemeSlug()
  return theme === "ecommerce-classic" ? themeFallback : null
}

export async function StorefrontBody({
  slug,
  fallback,
  runtime,
  empty,
}: {
  slug: string
  fallback: BuilderDocument | null
  runtime?: RuntimeContext
  empty?: ReactNode
}) {
  const document = await resolveStorefrontDocument(slug, fallback)
  if (!document) return empty ?? null
  return <StorefrontDocument document={document} runtime={runtime} />
}
