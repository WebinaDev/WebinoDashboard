import { classicHeaderDocument } from "@/builder/templates/classic"
import { PublishedDocument } from "@/builder/public-document"
import type { SiteChromeProps } from "@/themes/shared/types"

export async function SiteHeader({ siteName, branding }: SiteChromeProps) {
  return (
    <PublishedDocument
      document={classicHeaderDocument(siteName)}
      runtime={{ siteName, logoUrl: branding?.logo_url ?? null }}
    />
  )
}
