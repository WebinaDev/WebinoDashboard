import { loadPublishedTemplate, PublishedDocument } from "@/builder/public-document"
import { ishopHeaderDocument } from "@/builder/templates/ishop"
import type { SiteChromeProps } from "@/themes/shared/types"

export async function SiteHeader({ siteName, branding }: SiteChromeProps) {
  const published = await loadPublishedTemplate("header")
  const document = published ?? ishopHeaderDocument(siteName)
  return (
    <PublishedDocument
      document={document}
      runtime={{ siteName, logoUrl: branding?.logo_url ?? null }}
    />
  )
}
