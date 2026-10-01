import { Suspense, type ReactNode } from "react"

import { apiServer } from "@/lib/api-server"
import { DocumentView } from "./render/DocumentView"
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
  return readDocument(`/api/v1/public/builder/templates/${kind}`)
}

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
}: {
  document: BuilderDocument
  runtime?: RuntimeContext
}) {
  return (
    <Suspense fallback={null}>
      <DocumentView document={document} mode="view" device="desktop" runtime={runtime} themeClass="ishop-store" />
    </Suspense>
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
  return theme === "ecommerce-ishop" ? themeFallback : null
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
  return <PublishedDocument document={document} runtime={runtime} />
}
