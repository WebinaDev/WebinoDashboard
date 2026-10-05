import { cache, Suspense, type ReactNode } from "react"

import { apiServer } from "@/lib/api-server"
import { asGlobals, type BuilderGlobals } from "./globals"
import { DocumentView } from "./render/DocumentView"
import { themeQueryString, type ThemeQuery } from "./theme/context"
import { requestThemeContext } from "./theme/request"
import { isDocument } from "./tree"
import type { BuilderDocument, RuntimeContext } from "./types"

async function readDocument(path: string): Promise<BuilderDocument | null> {
  const res = await apiServer<{ data?: { document?: unknown } }>(path, { revalidate: 0 })
  const document = res?.data?.document
  return isDocument(document) ? document : null
}

export function loadPublishedPage(slug: string): Promise<BuilderDocument | null> {
  return readDocument(`/api/v1/public/builder/pages/${encodeURIComponent(slug)}`)
}

export function loadPublishedTemplate(kind: "header" | "footer"): Promise<BuilderDocument | null> {
  return loadResolvedTemplate(kind, { path: "/" })
}

export const loadPublishedGlobals = cache(async (): Promise<BuilderGlobals | null> => {
  const res = await apiServer<{ data?: { settings?: unknown } }>("/api/v1/public/builder/globals", { revalidate: 0 })
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
}: {
  document: BuilderDocument
  runtime?: RuntimeContext
  globals?: BuilderGlobals | null
}) {
  return (
    <Suspense fallback={null}>
      <DocumentView document={document} mode="view" device="desktop" runtime={runtime} globals={globals ?? undefined} themeClass="sf-classic" />
    </Suspense>
  )
}

export async function StorefrontDocument({
  document,
  runtime,
  context,
}: {
  document: BuilderDocument
  runtime?: RuntimeContext
  context?: ThemeQuery
}) {
  const globals = await loadPublishedGlobals()
  const query = context ?? (await requestThemeContext())
  const loop = runtime?.loopDocument ?? (await loadResolvedTemplate("loop_item", query))
  return (
    <PublishedDocument
      document={document}
      globals={globals}
      runtime={{ ...runtime, loopDocument: loop ?? undefined }}
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
