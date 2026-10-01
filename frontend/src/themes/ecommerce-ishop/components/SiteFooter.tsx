import { loadPublishedTemplate, PublishedDocument } from "@/builder/public-document"
import { ishopFooterDocument } from "@/builder/templates/ishop"

export async function SiteFooter({ siteName }: { siteName: string }) {
  const published = await loadPublishedTemplate("footer")
  const document = published ?? ishopFooterDocument(siteName)
  return <PublishedDocument document={document} runtime={{ siteName }} />
}
