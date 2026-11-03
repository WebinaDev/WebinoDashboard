import type { ReactNode } from "react"

import { StorefrontBody } from "@/builder/public-document"

/**
 * Prefer a published CMS builder document for a slug; otherwise render the module fallback.
 * Cafe module routes (/menu, /about, /reservations) otherwise hide designed builder pages.
 */
export async function preferBuilderPage(slug: string, fallback: ReactNode): Promise<ReactNode> {
  const built = await StorefrontBody({ slug, fallback: null })
  return built ?? fallback
}
