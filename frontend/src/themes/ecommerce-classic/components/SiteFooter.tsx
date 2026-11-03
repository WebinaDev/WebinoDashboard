import { PublishedDocument } from "@/builder/public-document"
import { classicFooterDocument } from "@/builder/templates/classic"
import type { SiteChromeProps } from "@/themes/shared/types"

export async function SiteFooter({ siteName }: SiteChromeProps) {
  return (
    <PublishedDocument
      document={classicFooterDocument(siteName)}
      runtime={{ siteName, themeSlug: "ecommerce-classic" }}
    />
  )
}
