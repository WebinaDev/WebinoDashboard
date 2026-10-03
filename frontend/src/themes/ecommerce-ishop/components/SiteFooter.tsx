import { PublishedDocument } from "@/builder/public-document"
import { ishopFooterDocument } from "@/builder/templates/ishop"

export async function SiteFooter({ siteName }: { siteName: string }) {
  return <PublishedDocument document={ishopFooterDocument(siteName)} runtime={{ siteName }} />
}
