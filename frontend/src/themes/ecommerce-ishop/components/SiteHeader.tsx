import { ishopHeaderDocument } from "@/builder/templates/ishop"
import { PublishedDocument } from "@/builder/public-document"
import type { SiteChromeProps } from "@/themes/shared/types"

export async function SiteHeader({ siteName, branding }: SiteChromeProps) {
  return (
    <PublishedDocument
      document={ishopHeaderDocument(siteName)}
      runtime={{ siteName, logoUrl: branding?.logo_url ?? null }}
    />
  )
}
